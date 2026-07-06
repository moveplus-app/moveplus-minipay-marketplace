/**
 * Verify MiniPay Celo ERC20 payment and mark marketplace order paid.
 * Status-only query when tx_hash omitted (Check Payment Status).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  fetchTransactionReceipt,
  findErc20TransferToTreasury,
  loadMinipayCeloConfig,
  normalizeEvmAddress,
  sha256Hex,
} from './minipay_celo.ts'
import { safeError, safeLog, shortAddress } from './log_sanitize.ts'
import {
  enforceRateLimits,
  RATE_LIMIT_ERROR,
  readClientIpForRateLimit,
} from './rate_limit.ts'

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
) {
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
    order_status: 'pending',
    delivery_region: 'Philippines only',
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
      .select('id, title, is_available, is_deleted')
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
      return json(paidPayload(session, itemTitle, session.purchase_id), 200)
    }

    if (sessionExpired(session) && session.status !== 'paid') {
      if (session.status !== 'expired') {
        await admin
          .from('marketplace_minipay_sessions')
          .update({ status: 'expired' })
          .eq('id', sessionId)
      }
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

    const receipt = await fetchTransactionReceipt(celoConfig.rpcUrl, txHashRaw)
    if (!receipt) {
      return json({
        success: false,
        error: 'Transaction not found yet',
        status: 'submitted',
      }, 202)
    }

    if (receipt.status !== '0x1') {
      await admin
        .from('marketplace_minipay_sessions')
        .update({ status: 'failed', tx_hash: txHashRaw, payer_wallet_address: payerWallet })
        .eq('id', sessionId)
      return json({ success: false, error: 'Transaction failed on-chain', status: 'failed' }, 400)
    }

    const expectedRaw = BigInt(session.crypto_amount_raw)
    const transfer = findErc20TransferToTreasury(
      receipt,
      session.token_address,
      session.treasury_address,
      payerWallet,
    )

    if (!transfer) {
      return json({
        success: false,
        error: 'Valid ERC20 transfer not found',
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

    if (!purchaseId) {
      const { data: purchase, error: purchaseErr } = await admin
        .from('purchases')
        .insert({
          user_id: workingSession.user_id,
          marketplace_item_id: workingSession.marketplace_item_id,
          energy_points_paid: 0,
          status: 'pending',
          customer_name: workingSession.customer_name,
          phone_number: workingSession.phone_number,
          email: workingSession.email,
          delivery_address: workingSession.delivery_address,
          comments: workingSession.comments,
          payment_method: 'minipay',
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

      if (!workingSession.purchase_id && purchaseId) {
        const { error: linkErr } = await admin
          .from('marketplace_minipay_sessions')
          .update({ purchase_id: purchaseId })
          .eq('id', sessionId)

        if (linkErr) {
          safeError('minipay_session_purchase_link_failed', { message: linkErr.message })
        }
      }
    }

    safeLog('minipay_checkout_paid', {
      session_id: sessionId,
      purchase_id: purchaseId,
      payer: shortAddress(payerWallet),
      tx_prefix: txHashRaw.slice(0, 10),
    })

    return json({
      ...paidPayload(
        {
          ...workingSession,
          tx_hash: txHashRaw,
          payer_wallet_address: payerWallet,
          status: 'paid',
          purchase_id: purchaseId,
        },
        itemTitle,
        purchaseId,
      ),
      explorer_url: `${celoConfig.explorerBaseUrl}${txHashRaw}`,
    }, 200)
  } catch (e) {
    safeError('minipay_verify_unhandled', { message: String(e) })
    return json({ success: false, error: 'Internal server error' }, 500)
  }
})
