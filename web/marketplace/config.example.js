/**
 * Move+ Web Marketplace — public config only (no secrets).
 * Copy to config.js on deploy.
 */
window.MOVEPLUS_MARKETPLACE_CONFIG = {
  supabaseUrl: 'https://YOUR_PROJECT.supabase.co',
  supabaseAnonKey: 'YOUR_SUPABASE_ANON_KEY',

  /** Hosted URL of this marketplace (no trailing slash). */
  hostedBaseUrl: 'https://amayatoken.online/moveplus/marketplace',

  /** Enable MiniPay checkout UI when window.ethereum.isMiniPay is true. */
  enableMiniPayCheckout: true,

  // MiniPay submission mode:
  // Keep Digital Gear hidden until MiniPay approval.
  // Set showDigitalGear=true later to restore the Real Items / Digital Gear toggle.
  showDigitalGear: false,

  /** Chain label for crypto price display (product prices come from Supabase). */
  chainName: 'Celo',

  /** @deprecated Product crypto prices come from marketplace_items.crypto_price. */
  cryptoAmountDisplay: null,
  /** @deprecated Product token symbols come from marketplace_items.crypto_currency. */
  cryptoTokenSymbol: 'cUSD',
  /** @deprecated MiniPay uses 18 decimals for cUSD on Celo. */
  cryptoTokenDecimals: 18,

  /** Edge function names (public). */
  createSessionFunction: 'minipay-checkout-create-session',
  verifyFunction: 'minipay-checkout-verify-payment',
  statusFunction: 'minipay-checkout-session-status',

  /** Optional: show sample products when catalog is empty (requires demoMode: true). */
  demoMode: false,
  DEMO_MODE: false,

  /** @deprecated use demoMode */
  enableDemoProducts: false,

  catalogTable: 'marketplace_items',
  marketplaceTable: 'marketplace_items',
  storageBucket: 'marketplace_images',

  /** Optional menu/deep link URLs */
  moveplusHomeUrl: 'https://amayatoken.online/moveplus',
  supportUrl: 'https://amayatoken.online/moveplus/support',
  moveplusAppDeepLink: 'https://amayatoken.online/moveplus/',

  /** Marketplace legal pages (relative paths or full HTTPS URLs) */
  termsUrl: 'terms',
  privacyUrl: 'privacy',
  refundUrl: 'refund',
};
