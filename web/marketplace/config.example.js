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

  /**
   * MiniPay stablecoin registry (public display / balance checks).
   * Server resolves address+decimals from its own registry — do not trust client.
   */
  supportedPaymentTokens: {
    USDT: {
      symbol: 'USDT',
      address: '0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e',
      decimals: 6,
    },
    USDC: {
      symbol: 'USDC',
      address: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C',
      decimals: 6,
    },
    cUSD: {
      symbol: 'cUSD',
      address: '0x765DE816845861e75A25fCA122bb6898B8B1282a',
      decimals: 18,
    },
  },
  paymentTokenPriority: ['USDT', 'USDC', 'cUSD'],

  /** @deprecated Product crypto prices are USD stablecoin amounts in marketplace_items.crypto_price. */
  cryptoAmountDisplay: null,
  /** @deprecated Prefer supportedPaymentTokens — kept for older builds. */
  cryptoTokenSymbol: 'USDT',
  /** @deprecated Prefer supportedPaymentTokens. */
  cryptoTokenDecimals: 6,

  /** Edge function names (public). */
  createSessionFunction: 'minipay-checkout-create-session',
  verifyFunction: 'minipay-checkout-verify-payment',
  statusFunction: 'minipay-checkout-session-status',
  linkSessionFunction: 'create-marketplace-link-session',
  linkVerifyFunction: 'marketplace-link-verify',
  accountSummaryFunction: 'marketplace-account-summary',
  energyBalanceFunction: 'marketplace-energy-balance',
  linkDisconnectFunction: 'marketplace-link-disconnect',
  webAuthSessionFunction: 'marketplace-web-auth-session',

  /**
   * Client preview defaults for Energy discount (server recalculates).
   * 10 Energy = ₱1 → energyPhpValue 0.10; phpPerCusd converts PHP discount to cUSD face.
   */
  paymentSettings: {
    energyPhpValue: 0.10,
    phpPerCusd: 56,
    maxEnergyDiscountPercent: 20,
    allowFullEnergyPayment: false,
  },

  /**
   * Email OTP / magic-code login for account linking.
   * Keep false until Supabase Auth email template shows a visible numeric token via {{ .Token }}.
   * Magic-link-only templates are not used in MiniPay (links may open outside the webview).
   */
  enableEmailOtpLogin: false,

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

  /** Earn Rewards — public Android Open Testing / iOS TestFlight (https only). */
  androidOpenTestingUrl: 'https://play.google.com/apps/testing/com.moveplus.moveplusapp',
  iosTestFlightUrl: 'https://testflight.apple.com/join/cbWsbNgt',

  /**
   * Optional local test flags for Energy checkout UI (safe summary only).
   * Production linking uses Supabase Auth inside the Mini App, then marketplace-web-auth-session.
   * moveplusAccountLinked: true,
   * moveplusEnergyBalance: 1200,
   * moveplusDisplayName: 'Athlete',
   */

  /** Marketplace legal pages (relative paths or full HTTPS URLs) */
  termsUrl: 'terms',
  privacyUrl: 'privacy',
  refundUrl: 'refund',
};
