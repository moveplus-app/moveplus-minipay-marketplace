-- Manual test product for limited-time offer flow.
-- Run in Supabase SQL editor after applying 20260809120000_marketplace_limited_offer.sql

INSERT INTO public.marketplace_items (
  title,
  description,
  energy_points_price,
  crypto_price,
  crypto_currency,
  category,
  stock_quantity,
  is_available,
  is_deleted,
  is_limited_offer,
  offer_ends_at,
  offer_label,
  source_url
)
SELECT
  'Test Decathlon Discount Item',
  'Limited-time test listing for offer expiry validation.',
  100,
  0.10,
  'cUSD',
  'General',
  3,
  true,
  false,
  true,
  now() + interval '10 minutes',
  'Decathlon sale',
  'https://www.decathlon.ph/'
WHERE NOT EXISTS (
  SELECT 1 FROM public.marketplace_items
  WHERE title = 'Test Decathlon Discount Item' AND is_deleted = false
);
