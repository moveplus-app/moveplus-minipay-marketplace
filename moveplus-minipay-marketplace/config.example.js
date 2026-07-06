/**
 * Public MiniPay Mini App config — no secrets.
 * verifyFunctionName: on-chain payment + session load for checkout page.
 * Flutter status polling uses minipay-checkout-session-status (not configured here).
 */
window.MOVEPLUS_MINIPAY_CONFIG = {
  supabaseUrl: 'https://YOUR_PROJECT.supabase.co',
  supabaseAnonKey: 'YOUR_SUPABASE_ANON_KEY',
  verifyFunctionName: 'minipay-checkout-verify-payment',
};
