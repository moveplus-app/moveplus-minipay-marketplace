/**
 * Move+ Web Marketplace — deployed config (public anon key only).
 * Edit supabaseUrl / supabaseAnonKey if your project differs.
 */
window.MOVEPLUS_MARKETPLACE_CONFIG = {
  supabaseUrl: 'https://soovcmmjnpeivmxlodru.supabase.co',
  supabaseAnonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNvb3ZjbW1qbnBlaXZteGxvZHJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEzODc3OTEsImV4cCI6MjA3Njk2Mzc5MX0.jxwO0QP3OJd7SrRqIi16QyPG6ch8itwnak6fkJEXnCg',

  hostedBaseUrl: 'https://amayatoken.online/moveplus/marketplace',

  enableMiniPayCheckout: true,

  // MiniPay submission mode:
  // Keep Digital Gear hidden until MiniPay approval.
  // Set showDigitalGear=true later to restore the Real Items / Digital Gear toggle.
  showDigitalGear: true,

  /** Genesis Digital Gear — local-first images; set true to try IPFS before local PNGs. */
  genesisPreferRemoteImages: false,
  /** Optional override of Lighthouse/IPFS prefix (CID also parsed for gateway mirrors). */
  // genesisImgPrefix: 'https://gateway.lighthouse.storage/ipfs/bafybeie3hiqwur425z45opp25tidmxolzeyq57owgg3m5lchvnkrxi7toq',

  /**
   * Base Founder Gear — public OpenSea / contract config (read-only view links).
   * Never put private keys here.
   */
  baseFounderGearContractAddress: '0x5a49da3337bbd589065cbd5d89090bdb06b51a18',
  baseFounderGearOpenSeaCollectionUrl:
    'https://opensea.io/collection/move-base-founder-gear',
  baseFounderGearOpenSeaItemBaseUrl:
    'https://opensea.io/item/base/0x5a49da3337bbd589065cbd5d89090bdb06b51a18',
  // baseNftExplorerBase: 'https://basescan.org/nft',
  // baseFounderImgPrefix: '', // optional remote image prefix (local assets preferred)

  cryptoAmountDisplay: '1.00',
  cryptoTokenSymbol: 'cUSD',
  chainName: 'Celo',

  createSessionFunction: 'minipay-checkout-create-session',
  verifyFunction: 'minipay-checkout-verify-payment',
  statusFunction: 'minipay-checkout-session-status',
  linkSessionFunction: 'create-marketplace-link-session',
  linkVerifyFunction: 'marketplace-link-verify',
  accountSummaryFunction: 'marketplace-account-summary',
  energyBalanceFunction: 'marketplace-energy-balance',
  linkDisconnectFunction: 'marketplace-link-disconnect',
  webAuthSessionFunction: 'marketplace-web-auth-session',

  /** Client preview defaults; server uses marketplace_payment_settings. */
  paymentSettings: {
    energyPhpValue: 0.10,
    phpPerCusd: 56,
    maxEnergyDiscountPercent: 20,
    allowFullEnergyPayment: false,
  },

  /** Email code login — enable only after Supabase template includes {{ .Token }}. */
  enableEmailOtpLogin: false,

  demoMode: false,
  DEMO_MODE: false,
  enableDemoProducts: false,

  catalogTable: 'marketplace_items',
  marketplaceTable: 'marketplace_items',
  storageBucket: 'marketplace_images',

  moveplusHomeUrl: 'https://amayatoken.online/moveplus',
  supportUrl: 'https://amayatoken.online/moveplus/support',
  moveplusAppDeepLink: 'https://amayatoken.online/moveplus/',

  /** Earn Rewards — public testing / beta install links (https only). */
  androidOpenTestingUrl: 'https://play.google.com/apps/testing/com.moveplus.moveplusapp',
  iosTestFlightUrl: 'https://testflight.apple.com/join/cbWsbNgt',
};
