-- Limited-time discount / offer expiry for Real Items marketplace products.

ALTER TABLE public.marketplace_items
  ADD COLUMN IF NOT EXISTS is_limited_offer boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS offer_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS offer_label text,
  ADD COLUMN IF NOT EXISTS source_url text;

COMMENT ON COLUMN public.marketplace_items.is_limited_offer IS
  'When true, product is only purchasable until offer_ends_at.';

COMMENT ON COLUMN public.marketplace_items.offer_ends_at IS
  'UTC expiry for limited offers. After this time the product cannot be purchased.';

COMMENT ON COLUMN public.marketplace_items.offer_label IS
  'Optional badge text, e.g. Decathlon sale, Limited deal.';

COMMENT ON COLUMN public.marketplace_items.source_url IS
  'Admin-only reference link (e.g. Decathlon product page). Not exposed on public catalog.';

CREATE INDEX IF NOT EXISTS idx_marketplace_items_offer_ends_at
  ON public.marketplace_items (offer_ends_at)
  WHERE is_limited_offer = true AND is_deleted = false;
