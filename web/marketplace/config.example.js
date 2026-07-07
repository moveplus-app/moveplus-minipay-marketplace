/**
 * Move+ Web Marketplace — public config only (no secrets).
 * Copy to config.js on deploy.
 */
window.MOVEPLUS_MARKETPLACE_CONFIG = {
  supabaseUrl: 'https://YOUR_PROJECT.supabase.co',
  supabaseAnonKey: 'YOUR_SUPABASE_ANON_KEY',

  /** Hosted URL of this marketplace (no trailing slash). */
  hostedBaseUrl: 'https://',

  /** Enable MiniPay checkout UI when window.ethereum.isMiniPay is true. */
  enableMiniPayCheckout: true,

  /** Display-only crypto price label (server uses env amount at checkout). */
  cryptoAmountDisplay: '1.00',
  cryptoTokenSymbol: 'cUSD',
  chainName: 'Celo',

  /** Edge function names (public). */
  createSessionFunction: 'minipay-checkout-create-session',
  verifyFunction: 'minipay-checkout-verify-payment',
  statusFunction: 'minipay-checkout-session-status',

  /** Optional: show sample products when catalog is empty (requires demoMode: true). */
  demoMode: false,

  /** @deprecated use demoMode */
  enableDemoProducts: false,

  catalogTable: 'marketplace_items',
  marketplaceTable: 'marketplace_items',
  storageBucket: 'marketplace_images',

  /** Optional menu/deep link URLs */
  moveplusHomeUrl: '',
  supportUrl: 'https://',
  moveplusAppDeepLink: 'https://',
};
