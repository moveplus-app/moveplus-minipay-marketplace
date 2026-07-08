-- Persist receipt_pending for paid MiniPay sessions awaiting manual Trezor recordDirectPayment.

ALTER TABLE public.marketplace_minipay_sessions
  ADD COLUMN IF NOT EXISTS receipt_pending boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.marketplace_minipay_sessions.receipt_pending IS
  'True when USDC payment is verified but recordDirectPayment receipt is not yet on-chain.';

UPDATE public.marketplace_minipay_sessions
SET receipt_pending = true
WHERE status = 'paid'
  AND receipt_tx_hash IS NULL;

UPDATE public.marketplace_minipay_sessions
SET receipt_pending = false
WHERE receipt_tx_hash IS NOT NULL;
