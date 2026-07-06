/**
 * Read-only MiniPay checkout session status (Flutter "Check Payment Status").
 * Does NOT verify on-chain txs and does NOT expose treasury/token build fields.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sha256Hex } from './minipay_celo.ts'
import { safeError } from './log_sanitize.ts'
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
        scope: 'minipay_checkout_status_ip',
        identifierParts: [ip],
        maxRequests: 120,
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
    if (!sessionId || !rawToken) {
      return json({ success: false, error: 'session_id and session_token required' }, 400)
    }

    const tokenHash = await sha256Hex(rawToken)

    const { data: session, error } = await admin
      .from('marketplace_minipay_sessions')
      .select(
        'id, status, purchase_id, tx_hash, token_symbol, crypto_amount_display, expires_at, marketplace_item_id',
      )
      .eq('id', sessionId)
      .eq('session_token_hash', tokenHash)
      .maybeSingle()

    if (error || !session) {
      return json({ success: false, error: 'Invalid session' }, 403)
    }

    const expired = new Date(session.expires_at).getTime() < Date.now()
    if (expired && session.status !== 'paid') {
      if (session.status !== 'expired') {
        await admin
          .from('marketplace_minipay_sessions')
          .update({ status: 'expired' })
          .eq('id', sessionId)
      }
      return json({
        success: false,
        status: 'expired',
        error: 'Session expired',
      }, 410)
    }

    const { data: item } = await admin
      .from('marketplace_items')
      .select('title')
      .eq('id', session.marketplace_item_id)
      .maybeSingle()

    const isPaid = session.status === 'paid'

    return json({
      success: true,
      status: session.status,
      is_paid: isPaid,
      payment_method: 'MiniPay',
      chain: 'Celo',
      token_symbol: session.token_symbol,
      amount_display: session.crypto_amount_display,
      item_title: item?.title ?? 'Item',
      tx_hash: session.tx_hash,
      purchase_id: session.purchase_id,
      order_status: isPaid ? 'pending' : null,
      delivery_region: 'Philippines only',
      expires_at: session.expires_at,
    }, 200)
  } catch (e) {
    safeError('minipay_status_unhandled', { message: String(e) })
    return json({ success: false, error: 'Internal server error' }, 500)
  }
})
