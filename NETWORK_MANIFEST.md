# Move+ Web Marketplace — Network Manifest

Public URLs and origins used by the web Marketplace. **No secrets** — service role keys, owner private keys, and other privileged credentials are server-side only.

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

- `minipay-checkout-create-session`
- `minipay-checkout-verify-payment`
- `minipay-checkout-session-status`

The browser uses the **Supabase anon key** only. The **service role key is never exposed** to the frontend.

## Celo / MiniPay

| Purpose | Value |
|--------|--------|
| Network | Celo mainnet |
| Chain ID | `42220` |
| RPC (server / verification) | `https://forno.celo.org` |
| Block explorer (tx links) | `https://celoscan.io/tx/` |
| Payment token | cUSD |
| cUSD token contract (Celo mainnet) | `0x765DE816845861e75A25fCA122bb6898B8B1282a` |
| MovePlusMarketplacePayments contract | `0x5A49DA3337bBd589065cbd5d89090BDb06b51A18` |
| Verified source (CeloScan) | https://celoscan.io/address/0x5A49DA3337bBd589065cbd5d89090BDb06b51A18#code |

MiniPay checkout transfers cUSD to the configured Move+ treasury wallet. On-chain receipt registration via `MovePlusMarketplacePayments.recordDirectPayment` is optional and owner-controlled; payment success does not depend on it for V1 checkout.

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
| Payment signing | User confirms cUSD ERC-20 transfer via MiniPay |

## Not included (intentionally)

- `SUPABASE_SERVICE_ROLE_KEY`
- `CELO_MARKETPLACE_PAYMENTS_OWNER_PRIVATE_KEY`
- Rate limit salts, Turnstile secrets, or other server-only env vars
