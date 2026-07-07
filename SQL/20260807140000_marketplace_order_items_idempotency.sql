-- Idempotency: one order line per purchase + marketplace item (verify-payment retries).

CREATE UNIQUE INDEX IF NOT EXISTS idx_marketplace_order_items_purchase_item_unique
  ON public.marketplace_order_items (purchase_id, marketplace_item_id);

COMMENT ON INDEX public.idx_marketplace_order_items_purchase_item_unique IS
  'Prevents duplicate marketplace_order_items when minipay-checkout-verify-payment retries.';
