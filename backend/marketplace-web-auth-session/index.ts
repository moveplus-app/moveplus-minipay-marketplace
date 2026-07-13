/**
 * Mint a marketplace web session from an authenticated Supabase user JWT.
 * Used by MiniPay Mini App / hosted marketplace after email/password or OTP login.
 * Returns marketplace_session_token + safe summary only — never returns JWT/refresh.
 */

import { serve } from 'https://'
import { createClient } from 'https://'
import { loadSafeAccountSummary } from './account_summary.ts'
import { safeError, safeLog } from './log_sanitize.ts'
import {
  enforceRateLimits,
  RATE_LIMIT_ERROR,
  readClientIpForRateLimit,
} from './rate_limit.ts'

const WEB_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

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

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function generateRawSessionToken(): string {
  return `${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '')}`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ success: false, error: 'Method not allowed' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anon = Deno.env.get('SUPABASE_ANON_KEY')
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !anon || !service) {
    return json({ success: false, error: 'Server misconfigured' }, 500)
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return json({ success: false, error: 'Unauthorized' }, 401)
  }

  const userClient = createClient(supabaseUrl, anon, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: auth, error: authErr } = await userClient.auth.getUser()
  if (authErr || !auth?.user) {
    return json({ success: false, error: 'Unauthorized' }, 401)
  }

  const userId = auth.user.id
  const admin = createClient(supabaseUrl, service)
  const clientIp = readClientIpForRateLimit(req)
  const rateLimit = await enforceRateLimits(admin, [
    {
      scope: 'marketplace_web_auth_session:user:15m',
      identifierParts: [userId],
      maxRequests: 10,
      windowSeconds: 15 * 60,
    },
    {
      scope: 'marketplace_web_auth_session:ip:15m',
      identifierParts: [clientIp],
      maxRequests: 40,
      windowSeconds: 15 * 60,
    },
  ])
  if (!rateLimit.ok) {
    safeLog('marketplace_web_auth_session_rate_limited', {
      scope: rateLimit.scope,
    })
    return json(RATE_LIMIT_ERROR, 429)
  }

  // Revoke prior active web sessions for this user (one browser link at a time).
  const nowIso = new Date().toISOString()
  await admin
    .from('marketplace_web_sessions')
    .update({ revoked_at: nowIso })
    .eq('user_id', userId)
    .is('revoked_at', null)

  const sessionToken = generateRawSessionToken()
  const sessionHash = await sha256Hex(sessionToken)
  const expiresAt = new Date(Date.now() + WEB_SESSION_TTL_MS).toISOString()
  const webSessionId = crypto.randomUUID()

  const { error: sessErr } = await admin.from('marketplace_web_sessions').insert({
    id: webSessionId,
    user_id: userId,
    session_hash: sessionHash,
    expires_at: expiresAt,
    last_seen_at: nowIso,
  })

  if (sessErr) {
    safeError('marketplace_web_auth_session_insert_failed', {
      code: sessErr.code ?? 'unknown',
    })
    return json({ success: false, error: 'Could not create web session' }, 500)
  }

  let account
  try {
    account = await loadSafeAccountSummary(admin, userId)
  } catch (e) {
    safeError('marketplace_web_auth_session_summary_failed', {
      reason: e instanceof Error ? e.message : 'unknown',
    })
    return json({ success: false, error: 'Could not load account summary' }, 500)
  }

  safeLog('marketplace_web_auth_session_ok', {})

  return json({
    success: true,
    session_token: sessionToken,
    expires_at: expiresAt,
    account,
  }, 200)
})
