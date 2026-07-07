# Move+ Web Marketplace

Mobile-responsive web marketplace that mirrors the **Move+ native app marketplace** catalog using the same Supabase backend.

## What this is

- Product catalog from `marketplace_items` (approved, in stock, not deleted)
- Mobile-first UI (360×720 minimum), dark Move+ styling
- Opens from Move+ app custom browser (optional feature flag)
- Can later be submitted as a **MiniPay Marketplace Mini App**
- **MiniPay wallet payment** only when `window.ethereum?.isMiniPay === true`
- **Energy checkout** remains in the native Move+ app for now

## What this is not

- Not a rewrite of the Move+ Flutter app
- Not activity tracking or Energy earning on web
- Not a replacement for `web/minipay-marketplace` (Checkout Bridge proof-of-ship)

## Deploy path

Upload this folder to Hostinger:

```
public_html/moveplus/marketplace/
```

Public URL:

```

```

## Setup

1. Copy `config.example.js` → `config.js`
2. Set public values only:
   - `supabaseUrl`
   - `supabaseAnonKey`
   - `hostedBaseUrl`
3. Upload `index.html`, `app.js`, `styles.css`, `config.js`

**Never commit** `config.js` with production keys if your repo is public. Use `config.example.js` as template.

## Feature flags (web `config.js`)

| Key | Default | Effect |
|-----|---------|--------|
| `enableMiniPayCheckout` | `true` | Allow MiniPay flow when provider detected |
| `enableDemoProducts` | `false` | Show demo product if catalog empty (`?debug=1` only) |

## Flutter integration

Native app feature flag (default off):

```dart
AppConfig.enableWebMarketplace // false by default
AppConfig.webRealMarketplaceBaseUrl // https://
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

## Testing

### A. Normal browser / custom browser

1. Open `https://`
2. Catalog loads from Supabase
3. Wallet pill shows **Browser mode**
4. MiniPay pay button disabled — **Open inside MiniPay to pay**
5. No `eth_requestAccounts` or `eth_sendTransaction`

### B. MiniPay context

1. Open URL inside MiniPay wallet browser
2. Wallet pill shows **MiniPay detected**
3. Complete checkout form → **Pay with MiniPay**
4. Confirm Celo ERC20 transfer
5. Backend verifies → paid state

### C. Move+ app

1. Enable `ENABLE_WEB_MARKETPLACE=true`
2. Marketplace → web icon → custom browser opens web marketplace
3. Native Energy purchase unchanged in Flutter marketplace
4. Activity tracking unaffected

### Debug diagnostics

Add `debug=1` to URL (`&debug=1` if query params exist). Shows provider status without raw session tokens.

## Energy payments

Web displays Energy price as information only. Message shown:

> Energy redemption is available inside the Move+ app.

No web Energy deduction in v1.

## Related folders

| Path | Purpose |
|------|---------|
| `web/marketplace/` | Source for this web app |
| `web/minipay-marketplace/` | MiniPay Checkout Bridge (proof-of-ship) |
| `web/moveplus-marketplace/` | NFT/Web3 browser marketplace (separate) |
| `public_html/moveplus/marketplace/` | Deploy mirror for Hostinger |
