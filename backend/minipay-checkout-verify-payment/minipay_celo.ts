/** Celo / MiniPay marketplace checkout helpers — canonical copy for edge functions. */

/**
 * MiniPay Celo stablecoin registry (server authority).
 * Client may send symbol only — never trust client address/decimals.
 *
 * Defaults: hardcoded Celo mainnet registry.
 * Optional overrides via:
 *   MINIPAY_DEFAULT_TOKEN_SYMBOL=cUSD
 *   MINIPAY_SUPPORTED_TOKENS_JSON=[...]
 *   or MINIPAY_TOKEN_{CUSD,USDT,USDC}_{ADDRESS,DECIMALS}
 */

export type MinipayTokenSymbol = 'USDT' | 'USDC' | 'cUSD'

export type MinipayTokenInfo = {
  symbol: MinipayTokenSymbol
  address: string
  decimals: number
}

/** Built-in Celo mainnet registry (allowlist source of truth when env unset). */
const BUILTIN_MINIPAY_TOKENS: Record<MinipayTokenSymbol, MinipayTokenInfo> = {
  cUSD: {
    symbol: 'cUSD',
    address: '0x765DE816845861e75A25fCA122bb6898B8B1282a',
    decimals: 18,
  },
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
}

/** Default selection order: cUSD first. */
export const MINIPAY_TOKEN_PRIORITY: MinipayTokenSymbol[] = ['cUSD', 'USDT', 'USDC']

function normalizeEvmAddressLocal(input: string): string | null {
  const s = input.trim().toLowerCase()
  if (!/^0x[a-f0-9]{40}$/.test(s)) return null
  return s
}

export function normalizeMinipayTokenSymbol(
  input: unknown,
): MinipayTokenSymbol | null {
  const raw = String(input ?? '').trim()
  if (!raw) return null
  const upper = raw.toUpperCase()
  if (upper === 'USDT') return 'USDT'
  if (upper === 'USDC') return 'USDC'
  if (upper === 'CUSD' || upper === 'USDM' || raw === 'cUSD') return 'cUSD'
  return null
}

function tokenFromPerSymbolEnv(symbol: MinipayTokenSymbol): MinipayTokenInfo | null {
  const key = symbol === 'cUSD' ? 'CUSD' : symbol
  const addressRaw = Deno.env.get(`MINIPAY_TOKEN_${key}_ADDRESS`)?.trim() ?? ''
  const decimalsRaw = Deno.env.get(`MINIPAY_TOKEN_${key}_DECIMALS`)?.trim() ?? ''
  if (!addressRaw && !decimalsRaw) return null
  const address = normalizeEvmAddressLocal(addressRaw)
  const decimals = Number(decimalsRaw)
  if (!address || !Number.isFinite(decimals) || decimals < 0 || decimals > 36) {
    return null
  }
  return { symbol, address, decimals }
}

function loadSupportedTokensFromEnv(): Record<MinipayTokenSymbol, MinipayTokenInfo> {
  const out: Record<MinipayTokenSymbol, MinipayTokenInfo> = {
    cUSD: { ...BUILTIN_MINIPAY_TOKENS.cUSD },
    USDT: { ...BUILTIN_MINIPAY_TOKENS.USDT },
    USDC: { ...BUILTIN_MINIPAY_TOKENS.USDC },
  }

  const jsonRaw = Deno.env.get('MINIPAY_SUPPORTED_TOKENS_JSON')?.trim()
  if (jsonRaw) {
    try {
      const parsed = JSON.parse(jsonRaw)
      if (Array.isArray(parsed)) {
        for (const row of parsed) {
          if (!row || typeof row !== 'object') continue
          const symbol = normalizeMinipayTokenSymbol(
            (row as { symbol?: unknown }).symbol,
          )
          if (!symbol) continue
          const address = normalizeEvmAddressLocal(
            String((row as { address?: unknown }).address ?? ''),
          )
          const decimals = Number((row as { decimals?: unknown }).decimals)
          if (!address || !Number.isFinite(decimals) || decimals < 0 || decimals > 36) {
            continue
          }
          out[symbol] = { symbol, address, decimals }
        }
      }
    } catch {
      // Keep built-in registry if JSON is invalid.
    }
  }

  for (const symbol of MINIPAY_TOKEN_PRIORITY) {
    const override = tokenFromPerSymbolEnv(symbol)
    if (override) out[symbol] = override
  }

  return out
}

let _registryCache: Record<MinipayTokenSymbol, MinipayTokenInfo> | null = null

function getTokenRegistry(): Record<MinipayTokenSymbol, MinipayTokenInfo> {
  if (!_registryCache) _registryCache = loadSupportedTokensFromEnv()
  return _registryCache
}

/** Live registry (env overrides applied). Prefer resolveMinipayToken(). */
export const SUPPORTED_MINIPAY_TOKENS: Record<MinipayTokenSymbol, MinipayTokenInfo> =
  new Proxy({} as Record<MinipayTokenSymbol, MinipayTokenInfo>, {
    get(_target, prop: string) {
      const symbol = normalizeMinipayTokenSymbol(prop)
      if (!symbol) return undefined
      return getTokenRegistry()[symbol]
    },
    ownKeys() {
      return [...MINIPAY_TOKEN_PRIORITY]
    },
    getOwnPropertyDescriptor(_t, prop) {
      const symbol = normalizeMinipayTokenSymbol(prop)
      if (!symbol) return undefined
      return {
        configurable: true,
        enumerable: true,
        value: getTokenRegistry()[symbol],
      }
    },
  })

export function getDefaultMinipayTokenSymbol(): MinipayTokenSymbol {
  const fromEnv = normalizeMinipayTokenSymbol(
    Deno.env.get('MINIPAY_DEFAULT_TOKEN_SYMBOL')?.trim() ?? '',
  )
  if (fromEnv) return fromEnv
  // Legacy single-token env — only if still a supported symbol.
  const legacy = normalizeMinipayTokenSymbol(
    Deno.env.get('MINIPAY_TOKEN_SYMBOL')?.trim() ?? '',
  )
  if (legacy) return legacy
  return 'cUSD'
}

export function resolveMinipayToken(
  symbolInput: unknown,
): MinipayTokenInfo | null {
  const symbol = normalizeMinipayTokenSymbol(symbolInput)
  if (!symbol) return null
  return getTokenRegistry()[symbol] ?? null
}

export function isSupportedMinipayTokenSymbol(input: unknown): boolean {
  return resolveMinipayToken(input) != null
}

export function listSupportedMinipayTokenSymbols(): MinipayTokenSymbol[] {
  return [...MINIPAY_TOKEN_PRIORITY]
}

/** keccak256("Transfer(address,address,uint256)") — ERC-20 / ERC-721 Transfer topic0 */
export const TRANSFER_EVENT_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

export const ERC20_TRANSFER_SELECTOR = '0xa9059cbb'

export type MinipayCeloConfig = {
  rpcUrl: string
  chainId: number
  /** @deprecated Prefer session / resolveMinipayToken — kept for demo fallback. */
  tokenSymbol: string
  /** @deprecated Prefer session / resolveMinipayToken */
  tokenAddress: string
  /** @deprecated Prefer session / resolveMinipayToken */
  tokenDecimals: number
  treasuryAddress: string
  checkoutBaseUrl: string
  explorerBaseUrl: string
  /** Fixed demo price display string (numeric only). */
  cryptoAmountDisplay: string
  demoAmountDisplay: string
  defaultTokenSymbol: MinipayTokenSymbol
}

export function normalizeEvmAddress(input: string): string | null {
  return normalizeEvmAddressLocal(input)
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function generateRawSessionToken(): string {
  const a = crypto.randomUUID().replace(/-/g, '')
  const b = crypto.randomUUID().replace(/-/g, '')
  return `${a}${b}`
}

export function parseUnitsDecimal(amount: string, decimals: number): bigint {
  const trimmed = amount.trim()
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error('invalid amount format')
  }
  const [whole, frac = ''] = trimmed.split('.')
  const fracPadded = (frac + '0'.repeat(decimals)).slice(0, decimals)
  const combined = `${whole}${fracPadded}`.replace(/^0+/, '') || '0'
  return BigInt(combined)
}

export function formatUnits(raw: bigint, decimals: number): string {
  const s = raw.toString().padStart(decimals + 1, '0')
  const whole = s.slice(0, -decimals) || '0'
  const frac = s.slice(-decimals).replace(/0+$/, '')
  return frac.length > 0 ? `${whole}.${frac}` : whole
}

/**
 * Load Celo RPC / treasury config.
 * Payment token is resolved per checkout via resolveMinipayToken(symbol).
 */
export function loadMinipayCeloConfig(): MinipayCeloConfig {
  const rpcUrl = Deno.env.get('CELO_RPC_URL')?.trim() ?? ''
  const chainIdRaw = Deno.env.get('CELO_CHAIN_ID')?.trim() ?? '42220'
  const chainId = Number(chainIdRaw)
  const treasuryAddress = normalizeEvmAddress(
    Deno.env.get('MOVEPLUS_TREASURY_ADDRESS')?.trim() ?? '',
  )
  const checkoutBaseUrl =
    Deno.env.get('MINIPAY_CHECKOUT_BASE_URL')?.trim().replace(/\/$/, '') ??
    'https://amayatoken.online/moveplus/minipay-marketplace'
  const amountDisplay =
    Deno.env.get('MINIPAY_CHECKOUT_AMOUNT_DISPLAY')?.trim() || '0.10'
  const explorerBaseUrl =
    chainId === 42220
      ? 'https://celoscan.io/tx/'
      : 'https://celo-sepolia.blockscout.com/tx/'

  const defaultSymbol = getDefaultMinipayTokenSymbol()
  const defaultToken =
    resolveMinipayToken(defaultSymbol) ?? resolveMinipayToken('cUSD')!

  if (!rpcUrl) throw new Error('CELO_RPC_URL not configured')
  if (!Number.isFinite(chainId) || chainId <= 0) {
    throw new Error('CELO_CHAIN_ID invalid')
  }
  if (!treasuryAddress) throw new Error('MOVEPLUS_TREASURY_ADDRESS invalid')

  return {
    rpcUrl,
    chainId,
    tokenSymbol: defaultToken.symbol,
    tokenAddress: defaultToken.address.toLowerCase(),
    tokenDecimals: defaultToken.decimals,
    treasuryAddress,
    checkoutBaseUrl,
    explorerBaseUrl,
    cryptoAmountDisplay: `${amountDisplay} ${defaultToken.symbol}`,
    demoAmountDisplay: amountDisplay,
    defaultTokenSymbol: defaultToken.symbol,
  }
}

export function encodeErc20TransferData(
  toAddress: string,
  amountRaw: bigint,
): string {
  const to = normalizeEvmAddress(toAddress)
  if (!to) throw new Error('invalid treasury for transfer')
  const toPadded = to.slice(2).padStart(64, '0')
  const amountHex = amountRaw.toString(16).padStart(64, '0')
  return `${ERC20_TRANSFER_SELECTOR}${toPadded}${amountHex}`
}

export function buildCheckoutUrl(
  baseUrl: string,
  sessionId: string,
  sessionToken: string,
): string {
  const u = new URL(baseUrl.includes('://') ? baseUrl : `https://${baseUrl}`)
  u.searchParams.set('session_id', sessionId)
  u.searchParams.set('token', sessionToken)
  return u.toString()
}

export type TransferLogMatch = {
  from: string
  to: string
  amount: bigint
  tokenAddress: string
}

export function findErc20TransferToTreasury(
  receipt: { logs?: Array<{ address?: string; topics?: string[]; data?: string }> },
  tokenAddress: string,
  treasuryAddress: string,
  payerWallet?: string | null,
): TransferLogMatch | null {
  const token = normalizeEvmAddress(tokenAddress)
  const treasury = normalizeEvmAddress(treasuryAddress)
  const payer = payerWallet ? normalizeEvmAddress(payerWallet) : null
  if (!token || !treasury || !receipt?.logs) return null

  for (const log of receipt.logs) {
    const logAddr = normalizeEvmAddress(String(log.address ?? ''))
    if (logAddr !== token) continue
    const topics = log.topics ?? []
    if (topics.length < 3) continue
    if (String(topics[0] ?? '').toLowerCase() !== TRANSFER_EVENT_TOPIC) continue

    const from = normalizeEvmAddress(`0x${String(topics[1]).slice(-40)}`)
    const to = normalizeEvmAddress(`0x${String(topics[2]).slice(-40)}`)
    if (!from || !to || to !== treasury) continue
    if (payer && from !== payer) continue

    let amount = 0n
    try {
      amount = BigInt(log.data ?? '0x0')
    } catch {
      continue
    }
    if (amount <= 0n) continue

    return { from, to, amount, tokenAddress: token }
  }
  return null
}

export type RpcLog = {
  address?: string
  topics?: string[]
  data?: string
}

export type RpcReceipt = {
  status?: string
  logs?: RpcLog[]
}

export async function fetchTransactionReceipt(
  rpcUrl: string,
  txHash: string,
): Promise<RpcReceipt | null> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_getTransactionReceipt',
      params: [txHash],
    }),
  })
  const json = await res.json()
  return (json?.result as RpcReceipt | null) ?? null
}

export function topicAddress(topic: string | undefined): string | null {
  if (!topic || !topic.startsWith('0x') || topic.length < 42) return null
  return normalizeEvmAddress(`0x${topic.slice(-40)}`)
}

export function parseUint256Hex(data: string | undefined): bigint {
  if (!data || data === '0x') return 0n
  const hex = data.startsWith('0x') ? data.slice(2) : data
  if (!/^[0-9a-f]*$/i.test(hex)) return 0n
  return BigInt(`0x${hex || '0'}`)
}

/** Alias used by some verify call sites. */
export type VerifiedTransfer = {
  from: string
  to: string
  amount: bigint
}
