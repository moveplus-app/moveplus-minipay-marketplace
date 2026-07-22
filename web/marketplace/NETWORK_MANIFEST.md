# Move+ — Network Manifest (Web Marketplace)

Public URLs and origins used by the **Move+ Web Marketplace** MiniPay submission. **No secrets** — service role keys, owner private keys, and other privileged credentials are server-side only.

Canonical copy also lives at `web/marketplace/NETWORK_MANIFEST.md`.

## Hosted site

| Purpose | URL |
|--------|-----|
| Marketplace (production) | `https://amayatoken.online/moveplus/marketplace/` |
| Move+ home / landing | `https://amayatoken.online/moveplus/` |
| Support | `https://amayatoken.online/moveplus/support` |
| Terms of Service | `https://amayatoken.online/moveplus/marketplace/terms/` |
| Privacy Policy | `https://amayatoken.online/moveplus/marketplace/privacy/` |
| Refund Policy | `https://amayatoken.online/moveplus/marketplace/refund/` |

## Supabase (backend)

| Purpose | URL / origin |
|--------|----------------|
| REST / PostgREST | `https://soovcmmjnpeivmxlodru.supabase.co/rest/v1/` |
| Edge Functions | `https://soovcmmjnpeivmxlodru.supabase.co/functions/v1/` |
| Storage (product images) | `https://soovcmmjnpeivmxlodru.supabase.co/storage/v1/` |

Edge functions used by MiniPay checkout (public names only):

- `minipay-checkout-create-session` (calculates Energy discount + remaining stablecoin server-side)
- `minipay-checkout-verify-payment` (verifies tx; deducts Energy discount after paid)
- `minipay-checkout-session-status`

Edge functions used by Move+ account linking (public names only):

- `marketplace-web-auth-session` (Supabase user JWT once after Mini App login)
- `marketplace-account-summary` (marketplace web session token)
- `marketplace-link-disconnect` (marketplace web session token)

Legacy (unused by current Mini App direct login; kept for rollback only):

- `create-marketplace-link-session`
- `marketplace-link-verify`

The browser uses the **Supabase anon key** only. The **service role key is never exposed** to the frontend. After login, the Supabase JWT is used once to mint a marketplace session, then cleared — marketplace calls use the opaque session token only.

## Celo / MiniPay

| Purpose | Value |
|--------|--------|
| Network | Celo mainnet |
| Chain ID | `42220` |
| RPC (server / verification) | `https://forno.celo.org` |
| Block explorer (tx links) | `https://celoscan.io/tx/` |
| Checkout currencies | cUSD (default), USDT, USDC (CELO is **not** used as checkout currency) |
| USDT | `0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e` (6 decimals) |
| USDC | `0xcebA9300f2b948710d2653dD7B07f33A8B32118C` (6 decimals) |
| cUSD | `0x765DE816845861e75A25fCA122bb6898B8B1282a` (18 decimals) |
| MovePlusMarketplacePayments contract | `0x5A49DA3337bBd589065cbd5d89090BDb06b51A18` |
| Verified contract source (CeloScan) | https://celoscan.io/address/0x5A49DA3337bBd589065cbd5d89090BDb06b51A18#code |

Product `crypto_price` is a USD stablecoin amount. Checkout lets the user pick USDT, USDC, or cUSD; the server resolves address/decimals from its registry (client never supplies them).

MiniPay checkout transfers the selected stablecoin to the configured Move+ treasury wallet. On-chain receipt registration via `MovePlusMarketplacePayments.recordDirectPayment` is optional and owner-controlled. If `allowedTokens(token)` is false for a selected token, payment can still verify as paid and receipt stays `receipt_pending` until the owner enables the token with `setAllowedToken`.

## Static assets

| Purpose | Origin |
|--------|--------|
| Marketplace static files | `https://amayatoken.online/moveplus/marketplace/` (same origin) |
| Product images | Supabase Storage bucket `marketplace_images` (see Supabase URL above) |
| Local preview assets | `assets/` under marketplace path (gear previews, icons) |

## Wallet / dApp

| Purpose | Notes |
|--------|--------|
| MiniPay | Detected via `window.ethereum.isMiniPay` when available |
| Wallet auto-connect | MiniPay provider prepared on page load; no manual Connect Wallet UI |
| Payment signing | User confirms selected stablecoin ERC-20 transfer via MiniPay |

## Not included (intentionally)

- `SUPABASE_SERVICE_ROLE_KEY`
- `CELO_MARKETPLACE_PAYMENTS_OWNER_PRIVATE_KEY`
- Rate limit salts, Turnstile secrets, or other server-only env vars
