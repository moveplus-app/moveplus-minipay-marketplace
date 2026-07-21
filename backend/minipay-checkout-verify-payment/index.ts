/**
 * Verify MiniPay Celo ERC20 payment and mark marketplace order paid.
 * Status-only query when tx_hash omitted (Check Payment Status).
 */

import { serve } from 'https://'
import { createClient } from 'https://'
import {
  fetchTransactionReceipt,
  findErc20TransferToTreasury,
  loadMinipayCeloConfig,
  normalizeEvmAddress,
  resolveMinipayToken,
  sha256Hex,
} from './minipay_celo.ts'
import {
  getMarketplacePaymentsContractAddress,
  hashMarketplaceOrderId,
  isMarketplaceOrderPaidOnChain,
  isMarketplaceTokenAllowedOnChain,
  loadMarketplacePaymentsSignerConfig,
  recordMarketplacePaymentReceipt,
} from './marketplace_payments_contract.ts'
import { safeError, safeLog, shortAddress } from './log_sanitize.ts'
import {
  enforceRateLimits,
  RATE_LIMIT_ERROR,
  readClientIpForRateLimit,
} from './rate_limit.ts'
import { isOfferExpiredRow, OFFER_EXPIRED_ERROR } from './marketplace_offer.ts'
import {
  mapEnergyDiscountStatusForClient,
  parseEnergyReservationRpc,
} from './energy_reservation.ts'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

function json(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function trimField(v: unknown, max = 500): string {
  return String(v ?? '').trim().slice(0, max)
}

type SessionRow = {
  id: string
  user_id: string | null
  marketplace_item_id: string
  purchase_id: string | null
  session_token_hash: string
  chain: string
  chain_id: number
  token_symbol: string
  token_address: string
  token_decimals: number
  crypto_amount_raw: string
  crypto_amount_display: string
  treasury_address: string
  payer_wallet_address: string | null
  tx_hash: string | null
  status: string
  customer_name: string
  phone_number: string
  email: string
  delivery_address: string
  comments: string | null
  expires_at: string
  cart_items: Array<Record<string, unknown>> | null
  total_quantity: number | null
  energy_points_total: number | null
  energy_discount_energy?: number | null
  energy_discount_php?: number | null
  energy_discount_crypto?: number | null
  energy_discount_applied_at?: string | null
  energy_discount_status?: string | null
  energy_discount_reservation_id?: string | null
  energy_discount_redeemed_at?: string | null
  energy_discount_released_at?: string | null
  fulfillment_review_required?: boolean | null
  receipt_contract_address: string | null
  receipt_tx_hash: string | null
  receipt_recorded_at: string | null
  receipt_order_hash: string | null
  receipt_pending: boolean | null
}

type CartItemSnapshot = {
  marketplace_item_id: string
  quantity: number
  product_title_snapshot: string
  energy_price_snapshot: number
  crypto_unit_display?: string
  token_symbol_snapshot?: string
}

function readCartItems(session: SessionRow): CartItemSnapshot[] {
  if (!Array.isArray(session.cart_items) || session.cart_items.length === 0) {
    return [{
      marketplace_item_id: session.marketplace_item_id,
      quantity: 1,
      product_title_snapshot: 'Item',
      energy_price_snapshot: 0,
      token_symbol_snapshot: session.token_symbol,
      crypto_unit_display: session.crypto_amount_display,
    }]
  }

  return session.cart_items.map((row) => ({
    marketplace_item_id: String(row.marketplace_item_id ?? session.marketplace_item_id),
    quantity: Math.max(1, Math.floor(Number(row.quantity ?? 1))),
    product_title_snapshot: String(row.product_title_snapshot ?? 'Item'),
    energy_price_snapshot: Math.max(0, Math.floor(Number(row.energy_price_snapshot ?? 0))),
    crypto_unit_display: row.crypto_unit_display ? String(row.crypto_unit_display) : undefined,
    token_symbol_snapshot: row.token_symbol_snapshot
      ? String(row.token_symbol_snapshot)
      : session.token_symbol,
  }))
}

async function insertOrderItems(
  admin: ReturnType<typeof createClient>,
  purchaseId: string,
  session: SessionRow,
  itemTitleFallback: string,
) {
  const lines = readCartItems(session)
  const rows = lines.map((line) => ({
    purchase_id: purchaseId,
    marketplace_item_id: line.marketplace_item_id,
    product_title_snapshot: line.product_title_snapshot || itemTitleFallback,
    quantity: line.quantity,
    energy_price_snapshot: line.energy_price_snapshot,
    crypto_price_snapshot: line.crypto_unit_display ?? session.crypto_amount_display,
    token_symbol_snapshot: line.token_symbol_snapshot ?? session.token_symbol,
  }))

  const { error } = await admin
    .from('marketplace_order_items')
    .upsert(rows, {
      onConflict: 'purchase_id,marketplace_item_id',
      ignoreDuplicates: true,
    })

  if (error) {
    safeError('minipay_order_items_upsert_failed', { message: error.message })
  }
}

async function loadSession(
  admin: ReturnType<typeof createClient>,
  sessionId: string,
): Promise<SessionRow | null> {
  const { data, error } = await admin
    .from('marketplace_minipay_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle()
  if (error || !data) return null
  return data as SessionRow
}

async function validateToken(
  session: SessionRow,
  rawToken: string,
): Promise<boolean> {
  const hash = await sha256Hex(rawToken)
  return hash === session.session_token_hash
}

function sessionExpired(session: SessionRow): boolean {
  return new Date(session.expires_at).getTime() < Date.now()
}

function paidPayload(
  session: SessionRow,
  itemTitle: string,
  purchaseId: string | null,
  celoExplorerBase?: string,
  receiptMeta?: {
    receipt_pending?: boolean
    receipt_explorer_url?: string | null
  },
  extras?: {
    fulfillment_review_required?: boolean
    energy_settle_warning?: string | null
  },
) {
  const receiptExplorer =
    receiptMeta?.receipt_explorer_url ??
    (session.receipt_tx_hash && celoExplorerBase
      ? `${celoExplorerBase}${session.receipt_tx_hash}`
      : null)

  const reviewRequired =
    extras?.fulfillment_review_required === true ||
    session.fulfillment_review_required === true

  return {
    success: true,
    status: 'paid',
    payment_method: 'MiniPay',
    chain: 'Celo',
    token_symbol: session.token_symbol,
    amount_display: session.crypto_amount_display,
    tx_hash: session.tx_hash,
    payer_wallet_address: session.payer_wallet_address,
    item_title: itemTitle,
    purchase_id: purchaseId,
    order_status: reviewRequired ? 'fulfillment_review' : 'pending',
    delivery_region: 'Philippines only',
    receipt_contract_address: session.receipt_contract_address ?? null,
    receipt_tx_hash: session.receipt_tx_hash ?? null,
    receipt_order_hash: session.receipt_order_hash ?? null,
    receipt_recorded_at: session.receipt_recorded_at ?? null,
    receipt_recorded: Boolean(session.receipt_tx_hash),
    receipt_pending: receiptMeta?.receipt_pending === true ||
      (session.receipt_pending === true && !session.receipt_tx_hash),
    receipt_explorer_url: receiptExplorer,
    energy_discount_status: mapEnergyDiscountStatusForClient(session),
    energy_discount_energy: Math.max(
      0,
      Math.floor(Number(session.energy_discount_energy ?? 0) || 0),
    ),
    fulfillment_review_required: reviewRequired,
    warning: extras?.energy_settle_warning ??
      (reviewRequired
        ? 'Payment verified but Energy discount needs admin review before fulfillment.'
        : null),
  }
}

async function settleEnergyDiscount(
  admin: ReturnType<typeof createClient>,
  sessionId: string,
  txHash: string | null,
): Promise<{ ok: boolean; reviewRequired: boolean; status?: string; errorCode?: string }> {
  const { data, error } = await admin.rpc('settle_minipay_energy_discount', {
    p_session_id: sessionId,
    p_tx_hash: txHash,
  })
  const parsed = parseEnergyReservationRpc(data)
  if (error) {
    safeError('minipay_energy_settle_rpc_failed', { message: error.message })
    await admin
      .from('marketplace_minipay_sessions')
      .update({
        fulfillment_review_required: true,
        energy_discount_status: 'failed',
      })
      .eq('id', sessionId)
    return { ok: false, reviewRequired: true, errorCode: 'rpc_error' }
  }
  if (!parsed.ok) {
    safeError('minipay_energy_settle_failed', {
      session_prefix: sessionId.slice(0, 8),
      code: parsed.error_code,
      status: parsed.status,
    })
    await admin
      .from('marketplace_minipay_sessions')
      .update({
        fulfillment_review_required: true,
        energy_discount_status: 'failed',
      })
      .eq('id', sessionId)
    return {
      ok: false,
      reviewRequired: true,
      status: parsed.status,
      errorCode: parsed.error_code,
    }
  }
  return {
    ok: true,
    reviewRequired: false,
    status: parsed.status,
  }
}

async function releaseEnergyDiscount(
  admin: ReturnType<typeof createClient>,
  sessionId: string,
  reason: string,
) {
  const { data, error } = await admin.rpc('release_minipay_energy_discount', {
    p_session_id: sessionId,
    p_reason: reason,
  })
  if (error) {
    safeError('minipay_energy_release_rpc_failed', {
      message: error.message,
      reason,
    })
    return
  }
  const parsed = parseEnergyReservationRpc(data)
  if (!parsed.ok) {
    safeError('minipay_energy_release_failed', {
      session_prefix: sessionId.slice(0, 8),
      code: parsed.error_code,
      reason,
    })
  }
}

async function persistReceiptFields(
  admin: ReturnType<typeof createClient>,
  sessionId: string,
  fields: {
    receipt_contract_address?: string | null
    receipt_tx_hash?: string | null
    receipt_order_hash?: string
    receipt_recorded_at?: string
    receipt_pending?: boolean
  },
) {
  const update: Record<string, string | boolean | null> = {}

  if (fields.receipt_contract_address !== undefined) {
    update.receipt_contract_address = fields.receipt_contract_address
  }
  if (fields.receipt_order_hash !== undefined) {
    update.receipt_order_hash = fields.receipt_order_hash
  }
  if (fields.receipt_pending !== undefined) {
    update.receipt_pending = fields.receipt_pending
  }
  if (fields.receipt_tx_hash) {
    update.receipt_tx_hash = fields.receipt_tx_hash
    update.receipt_recorded_at = fields.receipt_recorded_at ?? new Date().toISOString()
    update.receipt_pending = false
  }

  if (Object.keys(update).length === 0) return

  const { error } = await admin
    .from('marketplace_minipay_sessions')
    .update(update)
    .eq('id', sessionId)
    .is('receipt_tx_hash', null)

  if (error) {
    safeError('minipay_receipt_db_update_failed', { message: error.message })
  }
}

/**
 * Attach receipt metadata after payment is already marked paid.
 * Does not block checkout success; on-chain recordDirectPayment is manual (Trezor owner).
 */
async function prepareReceiptMetadata(
  admin: ReturnType<typeof createClient>,
  session: SessionRow,
  paymentTxHash: string,
  payerWallet: string,
  amountRaw: bigint,
): Promise<{
  session: SessionRow
  receiptPending: boolean
}> {
  if (session.receipt_tx_hash) {
    return { session, receiptPending: false }
  }

  const contractAddress = getMarketplacePaymentsContractAddress()
  const orderIdHash = session.receipt_order_hash ?? hashMarketplaceOrderId(session.id)

  const receiptRecord: {
    pending: boolean
    txHash: string | null
    recordedAt: string | undefined
  } = {
    pending: true,
    txHash: null,
    recordedAt: undefined,
  }

  const alreadyPaidOnChain = await isMarketplaceOrderPaidOnChain(session.id)
  if (alreadyPaidOnChain) {
    receiptRecord.pending = false
  }

  const tokenAllowedOnChain = await isMarketplaceTokenAllowedOnChain(session.token_address)
  if (tokenAllowedOnChain === false) {
    safeLog('marketplace_payments_token_not_allowed_on_chain', {
      session_prefix: session.id.slice(0, 8),
      token: session.token_address.slice(0, 10),
    })
    receiptRecord.pending = true
  }

  const signerConfig = loadMarketplacePaymentsSignerConfig()
  if (signerConfig && !alreadyPaidOnChain && tokenAllowedOnChain !== false) {
    const contractCallResult = await recordMarketplacePaymentReceipt({
      sessionId: session.id,
      payerAddress: payerWallet,
      tokenAddress: session.token_address,
      amountRaw,
      paymentTxHash,
    })

    if (contractCallResult.recorded || contractCallResult.alreadyPaidOnChain) {
      receiptRecord.pending = false
      receiptRecord.txHash = contractCallResult.receiptTxHash
      receiptRecord.recordedAt = new Date().toISOString()
    }
  }

  await persistReceiptFields(admin, session.id, {
    receipt_contract_address: contractAddress,
    receipt_order_hash: orderIdHash,
    receipt_tx_hash: receiptRecord.txHash,
    receipt_recorded_at: receiptRecord.recordedAt,
    receipt_pending: receiptRecord.pending,
  })

  const refreshed = await loadSession(admin, session.id)
  const merged = refreshed ?? {
    ...session,
    receipt_contract_address: contractAddress,
    receipt_order_hash: orderIdHash,
    receipt_tx_hash: receiptRecord.txHash,
    receipt_recorded_at: receiptRecord.recordedAt ?? null,
    receipt_pending: receiptRecord.pending,
  }

  return {
    session: merged,
    receiptPending: receiptRecord.pending && !merged.receipt_tx_hash,
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ success: false, error: 'Method not allowed' }, 405)
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    if (!supabaseUrl || !serviceKey) {
      return json({ success: false, error: 'Server misconfigured' }, 500)
    }

    const admin = createClient(supabaseUrl, serviceKey)

    const ip = readClientIpForRateLimit(req)
    const rate = await enforceRateLimits(admin, [
      {
        scope: 'minipay_checkout_verify_ip',
        identifierParts: [ip],
        maxRequests: 60,
        windowSeconds: 3600,
      },
    ])
    if (!rate.ok) {
      return json({ success: false, ...RATE_LIMIT_ERROR }, 429)
    }

    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return json({ success: false, error: 'Invalid JSON body' }, 400)
    }

    const sessionId = trimField(body.session_id, 64)
    const rawToken = trimField(body.session_token, 256)
    const txHashRaw = trimField(body.tx_hash, 80).toLowerCase()
    const payerWallet = normalizeEvmAddress(
      trimField(body.payer_wallet_address, 64),
    )

    if (!sessionId || !rawToken) {
      return json({ success: false, error: 'session_id and session_token required' }, 400)
    }

    const session = await loadSession(admin, sessionId)
    if (!session) {
      return json({ success: false, error: 'Session not found' }, 404)
    }

    if (!(await validateToken(session, rawToken))) {
      return json({ success: false, error: 'Invalid session token' }, 403)
    }

    const { data: item } = await admin
      .from('marketplace_items')
      .select('id, title, is_available, is_deleted, is_limited_offer, offer_ends_at')
      .eq('id', session.marketplace_item_id)
      .maybeSingle()

    const itemTitle = item?.title ?? 'Item'

    if (session.status === 'paid') {
      if (txHashRaw && session.tx_hash?.toLowerCase() !== txHashRaw) {
        return json({
          success: false,
          error: 'Session already paid with a different transaction',
          status: 'paid',
        }, 409)
      }

      // Retry settle if paid but reservation still reserved / review required.
      const energyStatus = String(session.energy_discount_status ?? 'none')
      const needsSettleRetry =
        Math.max(0, Math.floor(Number(session.energy_discount_energy ?? 0) || 0)) > 0 &&
        energyStatus !== 'redeemed' &&
        !session.energy_discount_applied_at

      let workingPaid = session
      let reviewRequired = session.fulfillment_review_required === true
      let energyWarning: string | null = null

      if (needsSettleRetry) {
        const settle = await settleEnergyDiscount(
          admin,
          sessionId,
          session.tx_hash ?? txHashRaw,
        )
        const refreshed = await loadSession(admin, sessionId)
        if (refreshed) workingPaid = refreshed
        if (!settle.ok) {
          reviewRequired = true
          energyWarning =
            'Payment verified but Energy discount settlement needs admin review. Order will not auto-fulfill.'
        } else {
          reviewRequired = workingPaid.fulfillment_review_required === true
        }
      }

      let celoConfigForReceipt
      try {
        celoConfigForReceipt = loadMinipayCeloConfig()
      } catch {
        celoConfigForReceipt = null
      }

      const paidTx = workingPaid.tx_hash ?? txHashRaw
      const paidPayer = workingPaid.payer_wallet_address ?? payerWallet
      const existingPaymentReceipt =
        !reviewRequired && paidTx && paidPayer
          ? await prepareReceiptMetadata(
            admin,
            workingPaid,
            paidTx,
            paidPayer,
            BigInt(workingPaid.crypto_amount_raw),
          )
          : {
            session: workingPaid,
            receiptPending: true,
          }

      return json(
        paidPayload(
          existingPaymentReceipt.session,
          itemTitle,
          workingPaid.purchase_id,
          celoConfigForReceipt?.explorerBaseUrl,
          { receipt_pending: existingPaymentReceipt.receiptPending },
          {
            fulfillment_review_required: reviewRequired,
            energy_settle_warning: energyWarning,
          },
        ),
        200,
      )
    }

    if (sessionExpired(session) && session.status !== 'paid') {
      if (session.status !== 'expired') {
        await admin
          .from('marketplace_minipay_sessions')
          .update({ status: 'expired' })
          .eq('id', sessionId)
      }
      await releaseEnergyDiscount(admin, sessionId, 'session_expired')
      return json({ success: false, error: 'Session expired', status: 'expired' }, 410)
    }

    if (!txHashRaw) {
      return json({
        success: true,
        status: session.status,
        payment_method: 'MiniPay',
        chain: 'Celo',
        chain_id: session.chain_id,
        token_symbol: session.token_symbol,
        token_address: session.token_address,
        token_decimals: session.token_decimals,
        amount_display: session.crypto_amount_display,
        amount_raw: session.crypto_amount_raw,
        treasury_address: session.treasury_address,
        item_title: itemTitle,
        expires_at: session.expires_at,
        delivery_region: 'Philippines only',
      }, 200)
    }

    if (!/^0x[a-f0-9]{64}$/.test(txHashRaw)) {
      return json({ success: false, error: 'Invalid tx_hash' }, 400)
    }
    if (!payerWallet) {
      return json({ success: false, error: 'payer_wallet_address required' }, 400)
    }

    const { data: txUsedElsewhere } = await admin
      .from('marketplace_minipay_sessions')
      .select('id')
      .eq('tx_hash', txHashRaw)
      .neq('id', sessionId)
      .maybeSingle()

    if (txUsedElsewhere?.id) {
      return json({ success: false, error: 'Transaction already used' }, 409)
    }

    let celoConfig
    try {
      celoConfig = loadMinipayCeloConfig()
    } catch (e) {
      safeError('minipay_verify_config_error', { message: String(e) })
      return json({ success: false, error: 'MiniPay checkout not configured' }, 503)
    }

    if (session.chain_id !== celoConfig.chainId) {
      return json({ success: false, error: 'Chain mismatch' }, 400)
    }

    // Harden: session token must match server registry (never trust client-supplied address).
    const registryToken = resolveMinipayToken(session.token_symbol)
    if (
      !registryToken ||
      normalizeEvmAddress(session.token_address) !==
        normalizeEvmAddress(registryToken.address) ||
      Number(session.token_decimals) !== Number(registryToken.decimals)
    ) {
      safeError('minipay_verify_token_registry_mismatch', {
        session_prefix: sessionId.slice(0, 8),
        symbol: session.token_symbol,
      })
      return json({ success: false, error: 'Unsupported payment token on session' }, 400)
    }

    const txReceipt = await fetchTransactionReceipt(celoConfig.rpcUrl, txHashRaw)
    if (!txReceipt) {
      return json({
        success: false,
        error: 'Transaction not found yet',
        status: 'submitted',
      }, 202)
    }

    if (txReceipt.status !== '0x1') {
      await admin
        .from('marketplace_minipay_sessions')
        .update({ status: 'failed', tx_hash: txHashRaw, payer_wallet_address: payerWallet })
        .eq('id', sessionId)
      await releaseEnergyDiscount(admin, sessionId, 'payment_failed_on_chain')
      return json({ success: false, error: 'Transaction failed on-chain', status: 'failed' }, 400)
    }

    const expectedRaw = BigInt(session.crypto_amount_raw)
    const transfer = findErc20TransferToTreasury(
      txReceipt,
      session.token_address,
      session.treasury_address,
      payerWallet,
    )

    if (!transfer) {
      return json({
        success: false,
        error: 'Valid ERC20 transfer not found',
        error_code: 'erc20_transfer_not_found',
        status: 'failed',
      }, 400)
    }

    if (transfer.amount < expectedRaw) {
      return json({
        success: false,
        error: 'Insufficient payment amount',
        status: 'failed',
      }, 400)
    }

    if (item?.is_deleted === true || item?.is_available !== true) {
      return json({ success: false, error: 'Product no longer available' }, 400)
    }

    if (item && isOfferExpiredRow(item)) {
      return json({ success: false, error: OFFER_EXPIRED_ERROR }, 400)
    }

    const cartLines = readCartItems(session)
    for (const line of cartLines) {
      const { data: lineItem } = await admin
        .from('marketplace_items')
        .select('id, title, is_available, is_deleted, stock_quantity, is_limited_offer, offer_ends_at')
        .eq('id', line.marketplace_item_id)
        .maybeSingle()

      if (!lineItem || lineItem.is_deleted === true || lineItem.is_available !== true) {
        return json({
          success: false,
          error: `Product no longer available: ${line.product_title_snapshot}`,
        }, 400)
      }

      if (isOfferExpiredRow(lineItem)) {
        return json({ success: false, error: OFFER_EXPIRED_ERROR }, 400)
      }

      const stockRaw = lineItem.stock_quantity
      const stock = stockRaw == null || stockRaw === ''
        ? null
        : Number.isFinite(Number(stockRaw))
          ? Math.floor(Number(stockRaw))
          : null
      if (stock === 0) {
        return json({
          success: false,
          error: `Product sold out: ${lineItem.title ?? line.product_title_snapshot}`,
        }, 400)
      }
      if (stock != null && stock > 0 && line.quantity > stock) {
        return json({
          success: false,
          error: `Insufficient stock for ${lineItem.title ?? line.product_title_snapshot}`,
        }, 400)
      }
    }

    // Atomic claim: only one verify request may mark this session paid.
    const { data: claimed } = await admin
      .from('marketplace_minipay_sessions')
      .update({
        status: 'paid',
        tx_hash: txHashRaw,
        payer_wallet_address: payerWallet,
      })
      .eq('id', sessionId)
      .neq('status', 'paid')
      .is('tx_hash', null)
      .select('*')
      .maybeSingle()

    let workingSession: SessionRow

    if (claimed) {
      workingSession = claimed as SessionRow
    } else {
      const refreshed = await loadSession(admin, sessionId)
      if (!refreshed) {
        return json({ success: false, error: 'Session not found' }, 404)
      }

      if (refreshed.status === 'paid') {
        if (refreshed.tx_hash?.toLowerCase() === txHashRaw) {
          workingSession = refreshed
        } else {
          return json({
            success: false,
            error: 'Session already paid with a different transaction',
            status: 'paid',
          }, 409)
        }
      } else {
        return json({
          success: false,
          error: 'Could not finalize checkout session',
          status: refreshed.status,
        }, 409)
      }
    }

    let purchaseId = workingSession.purchase_id
    let energySettleWarning: string | null = null
    let fulfillmentReviewRequired = workingSession.fulfillment_review_required === true

    // Redeem reserved Energy after paid claim (idempotent). Never deduct again here.
    {
      const settle = await settleEnergyDiscount(admin, sessionId, txHashRaw)
      if (!settle.ok) {
        fulfillmentReviewRequired = true
        energySettleWarning =
          'Payment verified but Energy discount settlement needs admin review. Order will not auto-fulfill.'
      } else {
        const refreshedAfterSettle = await loadSession(admin, sessionId)
        if (refreshedAfterSettle) {
          workingSession = refreshedAfterSettle
          fulfillmentReviewRequired =
            refreshedAfterSettle.fulfillment_review_required === true
        }
      }
    }

    if (!purchaseId) {
      const energyDiscountPaid = workingSession.energy_discount_energy != null
        ? Math.max(0, Math.floor(Number(workingSession.energy_discount_energy)))
        : 0

      const { data: purchase, error: purchaseErr } = await admin
        .from('purchases')
        .insert({
          user_id: workingSession.user_id,
          marketplace_item_id: workingSession.marketplace_item_id,
          energy_points_paid: energyDiscountPaid,
          status: 'pending',
          customer_name: workingSession.customer_name,
          phone_number: workingSession.phone_number,
          email: workingSession.email,
          delivery_address: workingSession.delivery_address,
          comments: fulfillmentReviewRequired
            ? [
              workingSession.comments,
              '[fulfillment_review_required] Energy discount settle failed — verify Energy ledger before shipping.',
            ].filter(Boolean).join('\n')
            : workingSession.comments,
          payment_method: energyDiscountPaid > 0 ? 'minipay_energy_discount' : 'minipay',
          payment_status: 'paid',
          chain: 'celo',
          tx_hash: txHashRaw,
          wallet_address: payerWallet,
          crypto_amount: workingSession.crypto_amount_display,
          crypto_currency: workingSession.token_symbol,
        })
        .select('id')
        .single()

      if (purchaseErr || !purchase?.id) {
        const duplicateTx = purchaseErr?.code === '23505' ||
          String(purchaseErr?.message ?? '').toLowerCase().includes('duplicate')

        if (duplicateTx) {
          const { data: existingPurchase } = await admin
            .from('purchases')
            .select('id, user_id, marketplace_item_id')
            .eq('tx_hash', txHashRaw)
            .maybeSingle()

          if (
            existingPurchase?.id &&
            existingPurchase.user_id === workingSession.user_id &&
            existingPurchase.marketplace_item_id === workingSession.marketplace_item_id
          ) {
            purchaseId = String(existingPurchase.id)
          } else {
            return json({
              success: false,
              error: 'Transaction already used for another order',
            }, 409)
          }
        } else {
          safeError('minipay_purchase_insert_failed', { message: purchaseErr?.message })
          return json({ success: false, error: 'Failed to create order' }, 500)
        }
      } else {
        purchaseId = purchase.id
      }

      // Do not enqueue automatic fulfillment when Energy settle needs review.
      if (purchaseId && !fulfillmentReviewRequired) {
        await insertOrderItems(admin, purchaseId, workingSession, itemTitle)
      } else if (purchaseId && fulfillmentReviewRequired) {
        safeLog('minipay_fulfillment_held_for_energy_review', {
          session_id: sessionId,
          purchase_id: purchaseId,
        })
      }

      if (!workingSession.purchase_id && purchaseId) {
        const { error: linkErr } = await admin
          .from('marketplace_minipay_sessions')
          .update({
            purchase_id: purchaseId,
            fulfillment_review_required: fulfillmentReviewRequired,
          })
          .eq('id', sessionId)

        if (linkErr) {
          safeError('minipay_session_purchase_link_failed', { message: linkErr.message })
        }
      }
    } else if (fulfillmentReviewRequired) {
      await admin
        .from('marketplace_minipay_sessions')
        .update({ fulfillment_review_required: true })
        .eq('id', sessionId)
    }

    safeLog('minipay_checkout_paid', {
      session_id: sessionId,
      purchase_id: purchaseId,
      payer: shortAddress(payerWallet),
      tx_prefix: txHashRaw.slice(0, 10),
      fulfillment_review_required: fulfillmentReviewRequired,
    })

    const paidSession: SessionRow = {
      ...workingSession,
      tx_hash: txHashRaw,
      payer_wallet_address: payerWallet,
      status: 'paid',
      purchase_id: purchaseId,
      fulfillment_review_required: fulfillmentReviewRequired,
    }

    // Hold receipt/on-chain fulfillment helpers when Energy review is required.
    if (fulfillmentReviewRequired) {
      return json({
        ...paidPayload(
          paidSession,
          itemTitle,
          purchaseId,
          celoConfig.explorerBaseUrl,
          { receipt_pending: true },
          {
            fulfillment_review_required: true,
            energy_settle_warning: energySettleWarning,
          },
        ),
        explorer_url: `${celoConfig.explorerBaseUrl}${txHashRaw}`,
      }, 200)
    }

    const receiptResult = await prepareReceiptMetadata(
      admin,
      paidSession,
      txHashRaw,
      payerWallet,
      transfer.amount,
    )

    return json({
      ...paidPayload(
        receiptResult.session,
        itemTitle,
        purchaseId,
        celoConfig.explorerBaseUrl,
        { receipt_pending: receiptResult.receiptPending },
        {
          fulfillment_review_required: false,
          energy_settle_warning: null,
        },
      ),
      explorer_url: `${celoConfig.explorerBaseUrl}${txHashRaw}`,
    }, 200)
  } catch (e) {
    safeError('minipay_verify_unhandled', { message: String(e) })
    return json({ success: false, error: 'Internal server error' }, 500)
  }
})
