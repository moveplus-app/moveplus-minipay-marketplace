-- MiniPay checkout uses USDC on Celo mainnet (not cUSD).
-- Apply before live MiniPay payments so create-session token checks pass.

UPDATE public.marketplace_items
SET crypto_currency = 'USDC'
WHERE is_deleted IS NOT TRUE
  AND (
    crypto_currency IS NULL
    OR upper(trim(crypto_currency)) IN ('CUSD', 'CUSd', 'cusd')
  );

COMMENT ON COLUMN public.marketplace_items.crypto_currency IS
  'ERC20 symbol for MiniPay checkout (production: USDC on Celo). Must match MINIPAY_TOKEN_SYMBOL.';
