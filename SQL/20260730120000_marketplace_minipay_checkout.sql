-- MiniPay / Celo marketplace checkout sessions (real-item marketplace only).

CREATE TABLE IF NOT EXISTS public.marketplace_minipay_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  marketplace_item_id uuid NOT NULL REFERENCES public.marketplace_items(id) ON DELETE RESTRICT,
  purchase_id uuid REFERENCES public.purchases(id) ON DELETE SET NULL,
  session_token_hash text NOT NULL,
  chain text NOT NULL DEFAULT 'celo' CHECK (chain = 'celo'),
  chain_id integer NOT NULL,
  provider text NOT NULL DEFAULT 'minipay' CHECK (provider = 'minipay'),
  token_symbol text NOT NULL,
  token_address text NOT NULL,
  token_decimals integer NOT NULL DEFAULT 18 CHECK (token_decimals >= 0 AND token_decimals <= 36),
  crypto_amount_raw numeric NOT NULL CHECK (crypto_amount_raw > 0),
  crypto_amount_display text NOT NULL,
  treasury_address text NOT NULL,
  payer_wallet_address text,
  tx_hash text,
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN (
      'pending',
      'wallet_opened',
      'submitted',
      'paid',
      'failed',
      'expired',
      'cancelled'
    )
  ),
  customer_name text NOT NULL,
  phone_number text NOT NULL,
  email text NOT NULL,
  delivery_address text NOT NULL,
  comments text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_marketplace_minipay_sessions_tx_hash_unique
  ON public.marketplace_minipay_sessions (lower(tx_hash))
  WHERE tx_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_marketplace_minipay_sessions_user_created
  ON public.marketplace_minipay_sessions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketplace_minipay_sessions_item_status
  ON public.marketplace_minipay_sessions (marketplace_item_id, status);

CREATE INDEX IF NOT EXISTS idx_marketplace_minipay_sessions_expires
  ON public.marketplace_minipay_sessions (expires_at)
  WHERE status IN ('pending', 'wallet_opened', 'submitted');

COMMENT ON TABLE public.marketplace_minipay_sessions IS
  'Hosted MiniPay checkout sessions for real-item marketplace (Celo stablecoin). Raw session token never stored.';

-- Additive purchase columns for mixed payment tracking (Energy unchanged).
ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'energy',
  ADD COLUMN IF NOT EXISTS payment_status text,
  ADD COLUMN IF NOT EXISTS chain text,
  ADD COLUMN IF NOT EXISTS tx_hash text,
  ADD COLUMN IF NOT EXISTS wallet_address text,
  ADD COLUMN IF NOT EXISTS crypto_amount text,
  ADD COLUMN IF NOT EXISTS crypto_currency text;

COMMENT ON COLUMN public.purchases.payment_method IS
  'energy | minipay — default energy for legacy rows';

ALTER TABLE public.marketplace_minipay_sessions ENABLE ROW LEVEL SECURITY;

-- No client INSERT/UPDATE; edge functions use service_role.
CREATE POLICY marketplace_minipay_sessions_select_own
  ON public.marketplace_minipay_sessions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL ON public.marketplace_minipay_sessions FROM PUBLIC;
GRANT SELECT ON public.marketplace_minipay_sessions TO authenticated;
GRANT ALL ON public.marketplace_minipay_sessions TO service_role;

CREATE OR REPLACE FUNCTION public.touch_marketplace_minipay_sessions_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_marketplace_minipay_sessions_updated_at
  ON public.marketplace_minipay_sessions;

CREATE TRIGGER trg_marketplace_minipay_sessions_updated_at
  BEFORE UPDATE ON public.marketplace_minipay_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_marketplace_minipay_sessions_updated_at();
