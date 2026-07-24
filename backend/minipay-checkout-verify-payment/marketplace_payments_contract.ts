/**
 * MovePlusMarketplacePayments — optional on-chain receipt after verified MiniPay transfer.
 * Production: contract owner is a Trezor wallet; verify-payment never signs recordDirectPayment.
 * ABI matched to verified deployment on Celo mainnet (Blockscout).
 */

import { ethers } from 'https://esm.sh/ethers@6'
import { normalizeEvmAddress } from './minipay_celo.ts'
import { safeError, safeLog, shortAddress } from './log_sanitize.ts'

export const MARKETPLACE_PAYMENTS_ABI = [
  'function recordDirectPayment(bytes32 orderIdHash, address payer, address token, uint256 amount, bytes32 paymentTxHash)',
  'function isPaid(bytes32 orderIdHash) view returns (bool)',
  'function getPayment(bytes32 orderIdHash) view returns (address payer, address token, uint256 amount, uint64 paidAt, bytes32 paymentTxHash, uint8 mode)',
  'function allowedTokens(address token) view returns (bool)',
  'function treasury() view returns (address)',
  'function owner() view returns (address)',
  'error OrderAlreadyPaid()',
] as const

export type MarketplacePaymentsSignerConfig = {
  rpcUrl: string
  contractAddress: string
  privateKey: string
}

export type ReceiptRecordResult = {
  recorded: boolean
  receiptTxHash: string | null
  receiptOrderHash: string
  contractAddress: string
  contractOwner: string | null
  signerAddress: string | null
  signerIsOwner: boolean
  alreadyPaidOnChain: boolean
  pending: boolean
  warning: string | null
}

export function hashMarketplaceOrderId(sessionId: string): string {
  return ethers.id(sessionId.trim())
}

export function paymentTxHashToBytes32(txHash: string): string {
  return ethers.zeroPadValue(txHash.toLowerCase(), 32)
}

/** Contract address for receipt metadata (no signer required). */
export function getMarketplacePaymentsContractAddress(): string | null {
  const contractRaw = Deno.env.get('CELO_MARKETPLACE_PAYMENTS_ADDRESS')?.trim() ?? ''
  return normalizeEvmAddress(contractRaw)
}

/**
 * Optional hot-wallet signer — disabled in production (Trezor owner).
 * Only used when CELO_MARKETPLACE_PAYMENTS_AUTO_RECORD=true (non-production).
 */
export function loadMarketplacePaymentsSignerConfig(): MarketplacePaymentsSignerConfig | null {
  if (Deno.env.get('CELO_MARKETPLACE_PAYMENTS_AUTO_RECORD')?.trim() !== 'true') {
    return null
  }

  const rpcUrl = Deno.env.get('CELO_RPC_URL')?.trim() ?? ''
  const contractAddress = getMarketplacePaymentsContractAddress()
  const privateKey = Deno.env.get('CELO_MARKETPLACE_PAYMENTS_OWNER_PRIVATE_KEY')?.trim() ?? ''

  if (!rpcUrl || !contractAddress || !privateKey) {
    return null
  }

  return { rpcUrl, contractAddress, privateKey }
}

/** @deprecated Use getMarketplacePaymentsContractAddress or loadMarketplacePaymentsSignerConfig */
export function loadMarketplacePaymentsConfig(): MarketplacePaymentsSignerConfig | null {
  return loadMarketplacePaymentsSignerConfig()
}

export async function isMarketplaceOrderPaidOnChain(
  sessionId: string,
): Promise<boolean> {
  const contractAddress = getMarketplacePaymentsContractAddress()
  const rpcUrl = Deno.env.get('CELO_RPC_URL')?.trim() ?? ''
  if (!contractAddress || !rpcUrl) return false

  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl)
    const contract = new ethers.Contract(
      contractAddress,
      MARKETPLACE_PAYMENTS_ABI,
      provider,
    )
    return Boolean(await contract.isPaid(hashMarketplaceOrderId(sessionId)))
  } catch {
    return false
  }
}

export async function isMarketplaceTokenAllowedOnChain(
  tokenAddress: string,
): Promise<boolean | null> {
  const contractAddress = getMarketplacePaymentsContractAddress()
  const rpcUrl = Deno.env.get('CELO_RPC_URL')?.trim() ?? ''
  const token = normalizeEvmAddress(tokenAddress)
  if (!contractAddress || !rpcUrl || !token) return null

  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl)
    const contract = new ethers.Contract(
      contractAddress,
      MARKETPLACE_PAYMENTS_ABI,
      provider,
    )
    return Boolean(await contract.allowedTokens(token))
  } catch {
    return null
  }
}

function isOrderAlreadyPaidError(err: unknown): boolean {
  const msg = String(err ?? '')
  if (msg.includes('OrderAlreadyPaid')) return true
  if (err && typeof err === 'object') {
    const e = err as { shortMessage?: string; reason?: string; data?: string }
    if (e.shortMessage?.includes('OrderAlreadyPaid')) return true
    if (e.reason?.includes('OrderAlreadyPaid')) return true
    try {
      const iface = new ethers.Interface([...MARKETPLACE_PAYMENTS_ABI])
      if (e.data) {
        const parsed = iface.parseError(e.data)
        if (parsed?.name === 'OrderAlreadyPaid') return true
      }
    } catch {
      /* ignore parse errors */
    }
  }
  return false
}

/**
 * Attempt on-chain recordDirectPayment — only when AUTO_RECORD + owner key configured.
 * Not used for normal MiniPay checkout (Trezor owner records manually).
 */
export async function recordMarketplacePaymentReceipt(params: {
  sessionId: string
  payerAddress: string
  tokenAddress: string
  amountRaw: bigint
  paymentTxHash: string
}): Promise<ReceiptRecordResult> {
  const orderIdHash = hashMarketplaceOrderId(params.sessionId)
  const paymentTxHashBytes32 = paymentTxHashToBytes32(params.paymentTxHash)
  const contractAddress = getMarketplacePaymentsContractAddress() ?? ''

  const base: ReceiptRecordResult = {
    recorded: false,
    receiptTxHash: null,
    receiptOrderHash: orderIdHash,
    contractAddress,
    contractOwner: null,
    signerAddress: null,
    signerIsOwner: false,
    alreadyPaidOnChain: false,
    pending: true,
    warning: 'receipt_pending',
  }

  const config = loadMarketplacePaymentsSignerConfig()
  if (!config) {
    return base
  }

  const payer = normalizeEvmAddress(params.payerAddress)
  const token = normalizeEvmAddress(params.tokenAddress)
  if (!payer || !token) {
    return base
  }

  try {
    const provider = new ethers.JsonRpcProvider(config.rpcUrl)
    const signer = new ethers.Wallet(config.privateKey, provider)
    const contract = new ethers.Contract(
      config.contractAddress,
      MARKETPLACE_PAYMENTS_ABI,
      signer,
    )

    const [contractOwner, signerAddress] = await Promise.all([
      contract.owner() as Promise<string>,
      signer.getAddress(),
    ])

    base.contractOwner = ethers.getAddress(contractOwner)
    base.signerAddress = ethers.getAddress(signerAddress)
    base.signerIsOwner =
      base.contractOwner.toLowerCase() === base.signerAddress.toLowerCase()

    if (!base.signerIsOwner) {
      safeError('marketplace_payments_signer_not_owner', {
        owner: shortAddress(base.contractOwner),
        signer: shortAddress(base.signerAddress),
      })
      return base
    }

    const alreadyPaid = Boolean(await contract.isPaid(orderIdHash))
    if (alreadyPaid) {
      base.alreadyPaidOnChain = true
      base.recorded = true
      base.pending = false
      base.warning = null
      return base
    }

    const tx = await contract.recordDirectPayment(
      orderIdHash,
      payer,
      token,
      params.amountRaw,
      paymentTxHashBytes32,
    ) as ethers.TransactionResponse

    const onChainReceiptWait = await tx.wait()
    if (!onChainReceiptWait || onChainReceiptWait.status !== 1) {
      safeError('marketplace_payments_receipt_tx_failed', {
        session_prefix: params.sessionId.slice(0, 8),
      })
      return base
    }

    base.recorded = true
    base.pending = false
    base.warning = null
    base.receiptTxHash = onChainReceiptWait.hash

    safeLog('marketplace_payments_receipt_recorded', {
      session_prefix: params.sessionId.slice(0, 8),
      receipt_prefix: onChainReceiptWait.hash.slice(0, 10),
      order_hash_prefix: orderIdHash.slice(0, 10),
    })

    return base
  } catch (err) {
    if (isOrderAlreadyPaidError(err)) {
      base.alreadyPaidOnChain = true
      base.recorded = true
      base.pending = false
      base.warning = null
      return base
    }

    safeError('marketplace_payments_receipt_error', {
      message: String(err),
      session_prefix: params.sessionId.slice(0, 8),
    })
    return base
  }
}
