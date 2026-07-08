-- MiniPay checkout uses cUSD on Celo mainnet (18 decimals).
-- Does not change crypto_price values.

UPDATE public.marketplace_items
SET crypto_currency = 'cUSD'
WHERE is_deleted IS NOT TRUE
  AND (
    crypto_currency IS NULL
    OR upper(trim(crypto_currency)) IN ('USDC', 'CUSD')
  );

COMMENT ON COLUMN public.marketplace_items.crypto_currency IS
  'ERC20 symbol for MiniPay checkout (production: cUSD on Celo). Must match MINIPAY_TOKEN_SYMBOL.';
