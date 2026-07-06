/** Celo / MiniPay marketplace checkout helpers — canonical copy for edge functions. */

export const TRANSFER_EVENT_TOPIC =
  ''

export const ERC20_TRANSFER_SELECTOR = '0xa9059cbb'

export type MinipayCeloConfig = {
  rpcUrl: string
  chainId: number
  tokenSymbol: string
  tokenAddress: string
  tokenDecimals: number
  treasuryAddress: string
  checkoutBaseUrl: string
  explorerBaseUrl: string
  /** Fixed demo price in smallest token units (server authority). */
  cryptoAmountRaw: bigint
  cryptoAmountDisplay: string
}

export function normalizeEvmAddress(input: string): string | null {
  const s = input.trim().toLowerCase()
  if (!/^0x[a-f0-9]{40}$/.test(s)) return null
  return s
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

export function loadMinipayCeloConfig(): MinipayCeloConfig {
  const rpcUrl = Deno.env.get('CELO_RPC_URL')?.trim() ?? ''
  const chainIdRaw = Deno.env.get('CELO_CHAIN_ID')?.trim() ?? '11142220'
  const chainId = Number(chainIdRaw)
  const tokenSymbol = Deno.env.get('MINIPAY_TOKEN_SYMBOL')?.trim() || 'cUSD'
  const tokenAddress = normalizeEvmAddress(
    Deno.env.get('MINIPAY_TOKEN_ADDRESS')?.trim() ?? '',
  )
  const treasuryAddress = normalizeEvmAddress(
    Deno.env.get('MOVEPLUS_TREASURY_ADDRESS')?.trim() ?? '',
  )
  const decimalsRaw = Deno.env.get('MINIPAY_TOKEN_DECIMALS')?.trim() ?? '18'
  const tokenDecimals = Number(decimalsRaw)
  const checkoutBaseUrl =
    Deno.env.get('MINIPAY_CHECKOUT_BASE_URL')?.trim().replace(/\/$/, '') ??
    'https://amayatoken.online/moveplus/minipay-marketplace'
  const amountDisplay =
    Deno.env.get('MINIPAY_CHECKOUT_AMOUNT_DISPLAY')?.trim() || '0.10'
  const explorerBaseUrl =
    chainId === 42220
      ? 'https://celoscan.io/tx/'
      : 'https://celo-sepolia.blockscout.com/tx/'

  if (!rpcUrl) throw new Error('CELO_RPC_URL not configured')
  if (!Number.isFinite(chainId) || chainId <= 0) {
    throw new Error('CELO_CHAIN_ID invalid')
  }
  if (!tokenAddress) throw new Error('MINIPAY_TOKEN_ADDRESS invalid')
  if (!treasuryAddress) throw new Error('MOVEPLUS_TREASURY_ADDRESS invalid')
  if (!Number.isFinite(tokenDecimals) || tokenDecimals < 0) {
    throw new Error('MINIPAY_TOKEN_DECIMALS invalid')
  }

  const cryptoAmountRaw = parseUnitsDecimal(amountDisplay, tokenDecimals)

  return {
    rpcUrl,
    chainId,
    tokenSymbol,
    tokenAddress,
    tokenDecimals,
    treasuryAddress,
    checkoutBaseUrl,
    explorerBaseUrl,
    cryptoAmountRaw,
    cryptoAmountDisplay: `${amountDisplay} ${tokenSymbol}`,
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

export type VerifiedTransfer = {
  from: string
  to: string
  amount: bigint
}

export function findErc20TransferToTreasury(
  receipt: RpcReceipt,
  tokenAddress: string,
  treasuryAddress: string,
  payerAddress: string,
): VerifiedTransfer | null {
  const token = normalizeEvmAddress(tokenAddress)
  const treasury = normalizeEvmAddress(treasuryAddress)
  const payer = normalizeEvmAddress(payerAddress)
  if (!token || !treasury || !payer) return null

  for (const log of receipt.logs ?? []) {
    const logAddr = normalizeEvmAddress(String(log.address ?? ''))
    if (logAddr !== token) continue
    const topics = log.topics ?? []
    if (topics[0]?.toLowerCase() !== TRANSFER_EVENT_TOPIC) continue
    const from = topicAddress(topics[1])
    const to = topicAddress(topics[2])
    if (!from || !to) continue
    if (from !== payer || to !== treasury) continue
    const amount = parseUint256Hex(log.data)
    return { from, to, amount }
  }
  return null
}

export function buildCheckoutUrl(
  baseUrl: string,
  sessionId: string,
  rawToken: string,
): string {
  const url = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`)
  url.searchParams.set('session_id', sessionId)
  url.searchParams.set('token', rawToken)
  return url.toString()
}
