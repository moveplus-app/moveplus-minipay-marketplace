-- Additive cart checkout support for Move+ Web Marketplace (MiniPay real items).

ALTER TABLE public.marketplace_minipay_sessions
  ADD COLUMN IF NOT EXISTS cart_items jsonb,
  ADD COLUMN IF NOT EXISTS total_quantity integer,
  ADD COLUMN IF NOT EXISTS energy_points_total bigint;

COMMENT ON COLUMN public.marketplace_minipay_sessions.cart_items IS
  'Server-validated cart snapshot: marketplace_item_id, quantity, title/price snapshots.';

CREATE TABLE IF NOT EXISTS public.marketplace_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  marketplace_item_id uuid NOT NULL REFERENCES public.marketplace_items(id) ON DELETE RESTRICT,
  product_title_snapshot text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0 AND quantity <= 99),
  energy_price_snapshot integer NOT NULL DEFAULT 0,
  crypto_price_snapshot text,
  token_symbol_snapshot text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketplace_order_items_purchase_id
  ON public.marketplace_order_items (purchase_id);

COMMENT ON TABLE public.marketplace_order_items IS
  'Line items for multi-item MiniPay marketplace purchases. Additive; legacy purchases remain single-item.';

ALTER TABLE public.marketplace_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY marketplace_order_items_select_own
  ON public.marketplace_order_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.purchases p
      WHERE p.id = marketplace_order_items.purchase_id
        AND p.user_id = auth.uid()
    )
  );

REVOKE ALL ON public.marketplace_order_items FROM PUBLIC;
GRANT SELECT ON public.marketplace_order_items TO authenticated;
GRANT ALL ON public.marketplace_order_items TO service_role;
