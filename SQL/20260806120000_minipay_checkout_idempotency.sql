-- MiniPay checkout idempotency: prevent duplicate purchases for the same on-chain tx.

CREATE UNIQUE INDEX IF NOT EXISTS idx_purchases_tx_hash_unique
  ON public.purchases (lower(tx_hash))
  WHERE tx_hash IS NOT NULL;

COMMENT ON INDEX public.idx_purchases_tx_hash_unique IS
  'One marketplace purchase per Celo tx_hash (MiniPay verify-payment idempotency).';

-- marketplace_minipay_sessions tx_hash uniqueness already created in 20260730120000 migration.
