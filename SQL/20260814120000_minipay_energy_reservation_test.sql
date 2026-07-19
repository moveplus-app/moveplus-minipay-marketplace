-- MiniPay Energy discount: atomic reserve → redeem / release.
-- Balance is deducted at reserve; settle finalizes; release restores unpaid holds.



-- ---------------------------------------------------------------------------
-- Reservation ledger
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketplace_energy_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.marketplace_minipay_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  energy_amount integer NOT NULL CHECK (energy_amount > 0),
  status text NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved', 'redeemed', 'released', 'failed')),
  reserved_at timestamptz NOT NULL DEFAULT now(),
  redeemed_at timestamptz,
  released_at timestamptz,
  expires_at timestamptz NOT NULL,
  tx_hash text,
  release_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketplace_energy_reservations_session_unique UNIQUE (session_id)
);

CREATE INDEX IF NOT EXISTS marketplace_energy_reservations_user_status_idx
  ON public.marketplace_energy_reservations (user_id, status);

CREATE INDEX IF NOT EXISTS marketplace_energy_reservations_expires_idx
  ON public.marketplace_energy_reservations (expires_at)
  WHERE status = 'reserved';

COMMENT ON TABLE public.marketplace_energy_reservations IS
  'MiniPay Energy holds: deducted at reserve, redeemed after paid verify, released on expire/fail.';

ALTER TABLE public.marketplace_energy_reservations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.marketplace_energy_reservations FROM PUBLIC;
GRANT ALL ON public.marketplace_energy_reservations TO service_role;

-- Users may read own reservations (no write from client).
DROP POLICY IF EXISTS marketplace_energy_reservations_select_own
  ON public.marketplace_energy_reservations;
CREATE POLICY marketplace_energy_reservations_select_own
  ON public.marketplace_energy_reservations
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Session reservation columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.marketplace_minipay_sessions
  ADD COLUMN IF NOT EXISTS energy_discount_status text NOT NULL DEFAULT 'none'
    CHECK (
      energy_discount_status IN (
        'none',
        'reserved',
        'redeemed',
        'released',
        'failed'
      )
    );

ALTER TABLE public.marketplace_minipay_sessions
  ADD COLUMN IF NOT EXISTS energy_discount_reserved_at timestamptz;

ALTER TABLE public.marketplace_minipay_sessions
  ADD COLUMN IF NOT EXISTS energy_discount_redeemed_at timestamptz;

ALTER TABLE public.marketplace_minipay_sessions
  ADD COLUMN IF NOT EXISTS energy_discount_released_at timestamptz;

ALTER TABLE public.marketplace_minipay_sessions
  ADD COLUMN IF NOT EXISTS energy_discount_reservation_id uuid
    REFERENCES public.marketplace_energy_reservations(id) ON DELETE SET NULL;

ALTER TABLE public.marketplace_minipay_sessions
  ADD COLUMN IF NOT EXISTS fulfillment_review_required boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.marketplace_minipay_sessions.energy_discount_status IS
  'none | reserved | redeemed | released | failed (failed = paid but settle review).';
COMMENT ON COLUMN public.marketplace_minipay_sessions.fulfillment_review_required IS
  'True when paid but Energy settle failed — admin must review before fulfillment.';

-- ---------------------------------------------------------------------------
-- reserve_minipay_energy_discount
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reserve_minipay_energy_discount(
  p_session_id uuid,
  p_user_id uuid,
  p_energy_amount integer,
  p_expires_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.marketplace_minipay_sessions%ROWTYPE;
  v_balance integer;
  v_existing public.marketplace_energy_reservations%ROWTYPE;
  v_reservation_id uuid;
  v_now timestamptz := now();
BEGIN
  IF p_session_id IS NULL OR p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'invalid_args');
  END IF;

  IF p_energy_amount IS NULL OR p_energy_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'invalid_amount');
  END IF;

  IF p_expires_at IS NULL OR p_expires_at <= v_now THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'invalid_expires_at');
  END IF;

  -- Lock session then user energy row (consistent order).
  SELECT * INTO v_session
  FROM public.marketplace_minipay_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'session_not_found');
  END IF;

  IF v_session.user_id IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'user_mismatch');
  END IF;

  IF v_session.status IN ('paid', 'cancelled', 'expired', 'failed') THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'session_not_open', 'status', v_session.status);
  END IF;

  IF v_session.expires_at <= v_now THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'session_expired');
  END IF;

  SELECT * INTO v_existing
  FROM public.marketplace_energy_reservations
  WHERE session_id = p_session_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.status = 'reserved'
       AND v_existing.user_id = p_user_id
       AND v_existing.energy_amount = p_energy_amount THEN
      RETURN jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'reservation_id', v_existing.id,
        'energy_amount', v_existing.energy_amount,
        'status', 'reserved',
        'reserved_at', v_existing.reserved_at,
        'expires_at', v_existing.expires_at
      );
    END IF;
    RETURN jsonb_build_object(
      'ok', false,
      'error_code', 'reservation_exists',
      'status', v_existing.status
    );
  END IF;

  IF COALESCE(v_session.energy_discount_status, 'none') = 'reserved'
     AND v_session.energy_discount_reservation_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'reservation_exists');
  END IF;

  SELECT energy_points INTO v_balance
  FROM public.users
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'user_not_found');
  END IF;

  v_balance := GREATEST(0, COALESCE(v_balance, 0));

  IF v_balance < p_energy_amount THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error_code', 'insufficient_balance',
      'balance', v_balance,
      'required', p_energy_amount
    );
  END IF;

  UPDATE public.users
  SET energy_points = v_balance - p_energy_amount
  WHERE id = p_user_id;

  INSERT INTO public.marketplace_energy_reservations (
    session_id,
    user_id,
    energy_amount,
    status,
    reserved_at,
    expires_at
  ) VALUES (
    p_session_id,
    p_user_id,
    p_energy_amount,
    'reserved',
    v_now,
    p_expires_at
  )
  RETURNING id INTO v_reservation_id;

  INSERT INTO public.energy_points_history (
    user_id,
    points_change,
    transaction_type,
    description,
    related_marketplace_id
  ) VALUES (
    p_user_id,
    -p_energy_amount,
    'reserved',
    format('MiniPay Energy discount reserved (session %s)', p_session_id),
    v_session.marketplace_item_id
  );

  UPDATE public.marketplace_minipay_sessions
  SET
    energy_discount_status = 'reserved',
    energy_discount_reserved_at = v_now,
    energy_discount_reservation_id = v_reservation_id,
    energy_discount_energy = p_energy_amount,
    updated_at = v_now
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'reservation_id', v_reservation_id,
    'energy_amount', p_energy_amount,
    'status', 'reserved',
    'balance_after', v_balance - p_energy_amount,
    'reserved_at', v_now,
    'expires_at', p_expires_at
  );
END;
$$;

COMMENT ON FUNCTION public.reserve_minipay_energy_discount(uuid, uuid, integer, timestamptz) IS
  'Atomically hold MiniPay Energy discount: lock user+session, deduct balance, insert reservation.';

REVOKE ALL ON FUNCTION public.reserve_minipay_energy_discount(uuid, uuid, integer, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_minipay_energy_discount(uuid, uuid, integer, timestamptz) TO service_role;

-- ---------------------------------------------------------------------------
-- settle_minipay_energy_discount
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.settle_minipay_energy_discount(
  p_session_id uuid,
  p_tx_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.marketplace_minipay_sessions%ROWTYPE;
  v_reservation public.marketplace_energy_reservations%ROWTYPE;
  v_now timestamptz := now();
  v_tx text;
  v_expected integer;
BEGIN
  IF p_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'invalid_args');
  END IF;

  v_tx := NULLIF(lower(trim(COALESCE(p_tx_hash, ''))), '');

  SELECT * INTO v_session
  FROM public.marketplace_minipay_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'session_not_found');
  END IF;

  v_expected := GREATEST(0, COALESCE(v_session.energy_discount_energy, 0)::integer);

  -- No discount on session → success noop.
  IF v_expected = 0 AND COALESCE(v_session.energy_discount_status, 'none') = 'none' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', 'noop',
      'energy_amount', 0
    );
  END IF;

  -- Already redeemed (session or reservation) → idempotent success.
  IF COALESCE(v_session.energy_discount_status, 'none') = 'redeemed'
     OR v_session.energy_discount_redeemed_at IS NOT NULL
     OR v_session.energy_discount_applied_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'status', 'already_redeemed',
      'energy_amount', v_expected,
      'reservation_id', v_session.energy_discount_reservation_id
    );
  END IF;

  SELECT * INTO v_reservation
  FROM public.marketplace_energy_reservations
  WHERE session_id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Discount expected but never reserved — fail closed (admin review).
    IF v_expected > 0 THEN
      UPDATE public.marketplace_minipay_sessions
      SET
        energy_discount_status = 'failed',
        fulfillment_review_required = true,
        updated_at = v_now
      WHERE id = p_session_id;

      RETURN jsonb_build_object(
        'ok', false,
        'error_code', 'reservation_missing',
        'energy_amount', v_expected
      );
    END IF;

    RETURN jsonb_build_object('ok', true, 'status', 'noop', 'energy_amount', 0);
  END IF;

  IF v_reservation.status = 'redeemed' THEN
    UPDATE public.marketplace_minipay_sessions
    SET
      energy_discount_status = 'redeemed',
      energy_discount_redeemed_at = COALESCE(energy_discount_redeemed_at, v_reservation.redeemed_at, v_now),
      energy_discount_applied_at = COALESCE(energy_discount_applied_at, v_reservation.redeemed_at, v_now),
      energy_discount_reservation_id = v_reservation.id,
      updated_at = v_now
    WHERE id = p_session_id;

    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'status', 'already_redeemed',
      'reservation_id', v_reservation.id,
      'energy_amount', v_reservation.energy_amount
    );
  END IF;

  IF v_reservation.status IN ('released', 'failed') THEN
    UPDATE public.marketplace_minipay_sessions
    SET
      energy_discount_status = 'failed',
      fulfillment_review_required = true,
      updated_at = v_now
    WHERE id = p_session_id;

    RETURN jsonb_build_object(
      'ok', false,
      'error_code', 'reservation_not_active',
      'status', v_reservation.status,
      'reservation_id', v_reservation.id
    );
  END IF;

  IF v_reservation.status <> 'reserved' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error_code', 'reservation_not_active',
      'status', v_reservation.status
    );
  END IF;

  -- Balance already deducted at reserve — convert hold to redeemed (no second deduct).
  UPDATE public.marketplace_energy_reservations
  SET
    status = 'redeemed',
    redeemed_at = v_now,
    tx_hash = COALESCE(v_tx, tx_hash),
    updated_at = v_now
  WHERE id = v_reservation.id;

  INSERT INTO public.energy_points_history (
    user_id,
    points_change,
    transaction_type,
    description,
    related_marketplace_id
  ) VALUES (
    v_reservation.user_id,
    0,
    'redeemed',
    format(
      'MiniPay Energy discount redeemed (session %s, reserved %s ENERGY)',
      p_session_id,
      v_reservation.energy_amount
    ),
    v_session.marketplace_item_id
  );

  UPDATE public.marketplace_minipay_sessions
  SET
    energy_discount_status = 'redeemed',
    energy_discount_redeemed_at = v_now,
    energy_discount_applied_at = COALESCE(energy_discount_applied_at, v_now),
    energy_discount_reservation_id = v_reservation.id,
    fulfillment_review_required = false,
    updated_at = v_now
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'status', 'redeemed',
    'reservation_id', v_reservation.id,
    'energy_amount', v_reservation.energy_amount,
    'redeemed_at', v_now
  );
END;
$$;

COMMENT ON FUNCTION public.settle_minipay_energy_discount(uuid, text) IS
  'Finalize reserved MiniPay Energy after payment — never double-deducts.';

REVOKE ALL ON FUNCTION public.settle_minipay_energy_discount(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_minipay_energy_discount(uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- release_minipay_energy_discount
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_minipay_energy_discount(
  p_session_id uuid,
  p_reason text DEFAULT 'released'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.marketplace_minipay_sessions%ROWTYPE;
  v_reservation public.marketplace_energy_reservations%ROWTYPE;
  v_now timestamptz := now();
  v_reason text;
  v_balance integer;
BEGIN
  IF p_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'invalid_args');
  END IF;

  v_reason := left(trim(COALESCE(NULLIF(p_reason, ''), 'released')), 200);

  SELECT * INTO v_session
  FROM public.marketplace_minipay_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'session_not_found');
  END IF;

  -- Never unwind Energy after a paid redeem.
  IF COALESCE(v_session.energy_discount_status, 'none') = 'redeemed'
     OR v_session.energy_discount_redeemed_at IS NOT NULL
     OR v_session.energy_discount_applied_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', 'already_redeemed',
      'energy_amount', COALESCE(v_session.energy_discount_energy, 0)
    );
  END IF;

  SELECT * INTO v_reservation
  FROM public.marketplace_energy_reservations
  WHERE session_id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    IF COALESCE(v_session.energy_discount_status, 'none') IN ('released', 'none') THEN
      RETURN jsonb_build_object('ok', true, 'status', 'noop', 'energy_amount', 0);
    END IF;
    RETURN jsonb_build_object('ok', true, 'status', 'noop', 'energy_amount', 0);
  END IF;

  IF v_reservation.status = 'redeemed' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', 'already_redeemed',
      'reservation_id', v_reservation.id,
      'energy_amount', v_reservation.energy_amount
    );
  END IF;

  IF v_reservation.status = 'released' THEN
    UPDATE public.marketplace_minipay_sessions
    SET
      energy_discount_status = 'released',
      energy_discount_released_at = COALESCE(energy_discount_released_at, v_reservation.released_at, v_now),
      updated_at = v_now
    WHERE id = p_session_id
      AND energy_discount_status IS DISTINCT FROM 'released';

    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'status', 'already_released',
      'reservation_id', v_reservation.id,
      'energy_amount', v_reservation.energy_amount
    );
  END IF;

  IF v_reservation.status <> 'reserved' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', 'noop',
      'reservation_status', v_reservation.status,
      'energy_amount', v_reservation.energy_amount
    );
  END IF;

  SELECT energy_points INTO v_balance
  FROM public.users
  WHERE id = v_reservation.user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'user_not_found');
  END IF;

  UPDATE public.users
  SET energy_points = COALESCE(v_balance, 0) + v_reservation.energy_amount
  WHERE id = v_reservation.user_id;

  UPDATE public.marketplace_energy_reservations
  SET
    status = 'released',
    released_at = v_now,
    release_reason = v_reason,
    updated_at = v_now
  WHERE id = v_reservation.id;

  INSERT INTO public.energy_points_history (
    user_id,
    points_change,
    transaction_type,
    description,
    related_marketplace_id
  ) VALUES (
    v_reservation.user_id,
    v_reservation.energy_amount,
    'reservation_released',
    format(
      'MiniPay Energy discount released (%s, session %s)',
      v_reason,
      p_session_id
    ),
    v_session.marketplace_item_id
  );

  UPDATE public.marketplace_minipay_sessions
  SET
    energy_discount_status = 'released',
    energy_discount_released_at = v_now,
    updated_at = v_now
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'status', 'released',
    'reservation_id', v_reservation.id,
    'energy_amount', v_reservation.energy_amount,
    'reason', v_reason,
    'balance_after', COALESCE(v_balance, 0) + v_reservation.energy_amount
  );
END;
$$;

COMMENT ON FUNCTION public.release_minipay_energy_discount(uuid, text) IS
  'Return reserved MiniPay Energy on expire/cancel/fail — never after redeem.';

REVOKE ALL ON FUNCTION public.release_minipay_energy_discount(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_minipay_energy_discount(uuid, text) TO service_role;
