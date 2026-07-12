# Move+ Web Marketplace

Mobile-responsive web marketplace that mirrors the **Move+ native app marketplace** catalog using the same Supabase backend.

## MiniPay submission status

**Submitted** to MiniPay Explore (pending review / live listing).

| Item | Value |
|------|--------|
| Marketplace URL | https://amayatoken.online/moveplus/marketplace/ |
| Payment tokens | USDT, USDC, cUSD (Celo mainnet) — CELO is **not** a checkout currency |
| USDT | `0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e` (6 decimals) |
| USDC | `0xcebA9300f2b948710d2653dD7B07f33A8B32118C` (6 decimals) |
| cUSD | `0x765DE816845861e75A25fCA122bb6898B8B1282a` (18 decimals) |
| MovePlusMarketplacePayments contract | `0x5A49DA3337bBd589065cbd5d89090BDb06b51A18` |
| Verified source (CeloScan) | https://celoscan.io/address/0x5A49DA3337bBd589065cbd5d89090BDb06b51A18#code |
| Celo chain ID | `42220` |
| RPC (verification) | `https://forno.celo.org` |

### Sample transaction

Pending first live MiniPay stablecoin test.

When available, add a CeloScan tx link here for reviewer reference.

### Smart contract verification

MovePlusMarketplacePayments source is **verified on CeloScan**:

https://celoscan.io/address/0x5A49DA3337bBd589065cbd5d89090BDb06b51A18#code

## Supply-chain security (dependencies)

The web marketplace is **static HTML/CSS/JS** and does **not** require npm dependencies for production frontend deployment. Upload `index.html`, `styles.css`, `app.js`, `config.js`, and assets directly to Hostinger.

Other folders in this monorepo (Flutter app, minigame, Base onboarding) have their own `package.json` files; those are **not** part of the marketplace production deploy path.

## What this is

- Product catalog from `marketplace_items` (approved, in stock, not deleted)
- Mobile-first UI (360×720 minimum), dark Move+ styling
- Opens from Move+ app custom browser (optional feature flag)
- **MiniPay stablecoin payment** (USDT / USDC / cUSD) when `window.ethereum?.isMiniPay === true` (wallet auto-connect; no manual Connect Wallet button)
- **Energy checkout** remains in the native Move+ app for now

## What this is not

- Not a rewrite of the Move+ Flutter app
- Not activity tracking or Energy earning on web
- Not a replacement for `web/minipay-marketplace` (Checkout Bridge proof-of-ship)

## Legal & support (MiniPay compliance)

Accessible from hamburger menu → **Settings**:

| Link | Path |
|------|------|
| Terms of Service | `/moveplus/marketplace/terms/` |
| Privacy Policy | `/moveplus/marketplace/privacy/` |
| Refund Policy | `/moveplus/marketplace/refund/` |
| Support | https://amayatoken.online/moveplus/support |

Footer also includes Terms · Privacy · Refund · Support.

## Network manifest

Public origins and contract addresses (no secrets):

- Repo root: `NETWORK_MANIFEST.md`
- Marketplace: `web/marketplace/NETWORK_MANIFEST.md`

## Deploy path

Upload this folder to Hostinger:

```
public_html/moveplus/marketplace/
```

Public URL:

```
https://amayatoken.online/moveplus/marketplace/
```

## Setup

1. Copy `config.example.js` → `config.js`
2. Set public values only:
   - `supabaseUrl`
   - `supabaseAnonKey`
   - `hostedBaseUrl`
3. Upload `index.html`, `app.js`, `styles.css`, `config.js`, legal pages (`terms/`, `privacy/`, `refund/`)

**Never commit** `config.js` with production keys if your repo is public. Use `config.example.js` as template.

## Feature flags (web `config.js`)

| Key | Default | Effect |
|-----|---------|--------|
| `enableMiniPayCheckout` | `true` | Allow MiniPay flow when provider detected |
| `showDigitalGear` | `false` | Show Digital Gear preview tab (preview-only) |
| `enableDemoProducts` | `false` | Show demo product if catalog empty (`?debug=1` only) |

## Flutter integration

Native app feature flag (default off):

```dart
AppConfig.enableWebMarketplace // false by default
AppConfig.webRealMarketplaceBaseUrl // https://amayatoken.online/moveplus/marketplace
```

Enable at build time:

```bash
flutter run --dart-define=ENABLE_WEB_MARKETPLACE=true
```

When enabled, Marketplace screen shows a web icon that opens this URL in custom browser (`LaunchMode.inAppBrowserView`).

## Backend (reused)

- `marketplace_items` — catalog (anon read via RLS)
- `minipay-checkout-create-session`
- `minipay-checkout-verify-payment`
- `minipay-checkout-session-status`
- `marketplace_minipay_sessions`

## MiniPay wallet UX

### Inside MiniPay (`window.ethereum.isMiniPay`)

- Provider auto-detected on page load
- Wallet prepared automatically (no **Connect Wallet** button)
- Stablecoin selector: **USDT / USDC / cUSD** (same USD product price)
- Default preference: token with enough balance, else USDT → USDC → cUSD
- Checkout button: **Pay with USDT** / **Pay with USDC** / **Pay with cUSD**
- User confirms ERC-20 transfer in MiniPay
- Product `crypto_price` is a USD stablecoin amount (e.g. `0.01` → USDT/USDC raw `10000`, cUSD raw `10000000000000000`)

### Normal browser

- Catalog and Energy info work
- Graceful message: *Wallet signing is unavailable in a normal browser. Open inside MiniPay to pay with crypto.*
- No broken manual wallet-connect flow

## Testing

### A. Normal browser / custom browser

1. Open `https://amayatoken.online/moveplus/marketplace/`
2. Catalog loads from Supabase
3. MiniPay pay button disabled — **Open inside MiniPay to pay**
4. No manual Connect Wallet UI

### B. MiniPay context

1. Open URL inside MiniPay wallet browser
2. Wallet auto-connects on load
3. Choose USDT, USDC, or cUSD → complete checkout → **Pay with {token}**
4. Confirm Celo ERC-20 transfer
5. Backend verifies against server-stored token address/amount → paid state

### C. Move+ app

1. Enable `ENABLE_WEB_MARKETPLACE=true`
2. Marketplace → web icon → custom browser opens web marketplace
3. Native Energy purchase unchanged in Flutter marketplace
4. Activity tracking unaffected

### Debug diagnostics

Add `debug=1` to URL (`&debug=1` if query params exist). Shows provider status without raw session tokens.

## Energy payments

Web can **link** a Move+ account (via one-time app `link_token`) and show Energy balance + Digital Gear summary.

Web **does not deduct Energy** in v1. Pay with ENERGY shows “coming soon” when linked with sufficient balance. Native `createPurchase()` remains the Energy spend path inside the Move+ app.

MiniPay USDT / USDC / cUSD checkout is unchanged and works without linking.

## Related folders

| Path | Purpose |
|------|---------|
| `web/marketplace/` | Source for this web app |
| `web/minipay-marketplace/` | MiniPay Checkout Bridge (proof-of-ship) |
| `web/moveplus-marketplace/` | NFT/Web3 browser marketplace (separate) |
| `public_html/moveplus/marketplace/` | Deploy mirror for Hostinger |

## Icon attribution

- `link-svgrepo-com.svg` and `wallet-2-svgrepo-com.svg` from [SVG Repo](https://www.svgrepo.com/).
