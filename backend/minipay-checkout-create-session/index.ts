/**
 * Create hosted MiniPay marketplace checkout session.
 * Does NOT deduct Energy. Raw session token returned once; DB stores hash only.
 */


import {
  buildCheckoutUrl,
  formatUnits,
  generateRawSessionToken,
  loadMinipayCeloConfig,
  parseUnitsDecimal,
  sha256Hex,
} from './minipay_celo.ts'
import { safeError, safeLog } from './log_sanitize.ts'
import {
  enforceRateLimits,
  RATE_LIMIT_ERROR,
  readClientIpForRateLimit,
} from './rate_limit.ts'

const SESSION_TTL_MS = 15 * 60 * 1000

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

type CartLineInput = { id: string; quantity: number }

type CartLineResolved = {
  marketplace_item_id: string
  quantity: number
  product_title_snapshot: string
  energy_price_snapshot: number
  crypto_unit_display: string
  crypto_unit_raw: string
  token_symbol_snapshot: string
  stock_quantity: number | null
}

function readStockQuantity(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? Math.floor(n) : null
}

function readPositiveDecimal(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : null
}

function isDemoCheckoutMode(): boolean {
  return Deno.env.get('MINIPAY_MARKETPLACE_DEMO_MODE') === 'true' ||
    Deno.env.get('DEMO_MODE') === 'true'
}

function decimalAmountString(amount: number, decimals: number): string {
  return amount.toFixed(Math.min(8, decimals)).replace(/\.?0+$/, '') || '0'
}

function tokenMatchesConfigured(
  productToken: string,
  configuredToken: string,
): boolean {
  const product = productToken.trim()
  const configured = configuredToken.trim()
  if (!product || !configured) return false
  return product.toUpperCase() === configured.toUpperCase()
}

function parseCartLineInputs(body: Record<string, unknown>): CartLineInput[] {
  const rawItems = body.items
  if (Array.isArray(rawItems) && rawItems.length > 0) {
    const merged = new Map<string, number>()
    for (const row of rawItems) {
      if (!row || typeof row !== 'object') continue
      const r = row as Record<string, unknown>
      const id = trimField(r.marketplace_item_id, 64)
      const qty = Math.floor(Number(r.quantity ?? 1))
      if (!id || !Number.isFinite(qty) || qty < 1 || qty > 99) continue
      merged.set(id, (merged.get(id) ?? 0) + qty)
    }
    const lines = [...merged.entries()].map(([id, quantity]) => ({ id, quantity }))
    if (lines.length > 0) return lines.slice(0, 20)
  }

  const singleId = trimField(body.marketplace_item_id, 64)
  if (singleId) return [{ id: singleId, quantity: 1 }]
  return []
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

    let celoConfig
    try {
      celoConfig = loadMinipayCeloConfig()
    } catch (e) {
      safeError('minipay_create_config_error', { message: String(e) })
      return json({ success: false, error: 'MiniPay checkout not configured' }, 503)
    }

    const authHeader = req.headers.get('Authorization') ?? ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const admin = createClient(supabaseUrl, serviceKey)

    const { data: authData } = await userClient.auth.getUser()
    const userId = authData.user?.id ?? null

    const ip = readClientIpForRateLimit(req)
    const rate = await enforceRateLimits(admin, [
      {
        scope: 'minipay_checkout_create_ip',
        identifierParts: [ip],
        maxRequests: 20,
        windowSeconds: 3600,
      },
      {
        scope: 'minipay_checkout_create_user',
        identifierParts: [userId ?? ip],
        maxRequests: 10,
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

    const customerName = trimField(body.customer_name, 200)
    const phoneNumber = trimField(body.phone_number, 40)
    const email = trimField(body.email, 200)
    const deliveryAddress = trimField(body.delivery_address, 1000)
    const comments = trimField(body.comments, 1000) || null

    const cartInputs = parseCartLineInputs(body)
    if (cartInputs.length === 0) {
      return json({ success: false, error: 'items or marketplace_item_id required' }, 400)
    }
    if (!customerName || !phoneNumber || !email || !deliveryAddress) {
      return json({ success: false, error: 'Missing checkout fields' }, 400)
    }
    if (!email.includes('@')) {
      return json({ success: false, error: 'Invalid email' }, 400)
    }

    const ids = cartInputs.map((line) => line.id)
    const { data: itemRows, error: itemsErr } = await admin
      .from('marketplace_items')
      .select(
        'id, title, is_available, is_deleted, stock_quantity, energy_points_price, crypto_price, crypto_currency',
      )
      .in('id', ids)

    if (itemsErr) {
      safeError('minipay_create_items_fetch_failed', { message: itemsErr.message })
      return json({ success: false, error: 'Could not load products' }, 500)
    }

    const itemById = new Map(
      (itemRows ?? []).map((row) => [String(row.id), row]),
    )

    const resolvedLines: CartLineResolved[] = []
    let totalQuantity = 0
    let energyPointsTotal = 0
    let totalCryptoRaw = 0n
    const demoMode = isDemoCheckoutMode()
    const configuredToken = celoConfig.tokenSymbol.trim()

    for (const line of cartInputs) {
      const item = itemById.get(line.id)
      if (!item) {
        return json({ success: false, error: 'Product not found' }, 404)
      }
      if (item.is_deleted === true || item.is_available !== true) {
        return json({ success: false, error: `Product unavailable: ${item.title ?? line.id}` }, 400)
      }

      const stock = readStockQuantity(item.stock_quantity)
      if (stock === 0) {
        return json({
          success: false,
          error: `Product sold out: ${item.title ?? 'item'}`,
        }, 400)
      }
      if (stock != null && stock > 0 && line.quantity > stock) {
        return json({
          success: false,
          error: `Insufficient stock for ${item.title ?? 'item'}`,
        }, 400)
      }

      let unitPrice = readPositiveDecimal(item.crypto_price)
      const productToken = String(item.crypto_currency ?? '').trim()

      if (!demoMode) {
        if (unitPrice == null) {
          return json({
            success: false,
            error: `Product missing crypto price: ${item.title ?? line.id}`,
          }, 400)
        }
        if (!tokenMatchesConfigured(productToken, configuredToken)) {
          return json({
            success: false,
            error: 'Product payment currency is not supported for this checkout.',
          }, 400)
        }
      } else {
        if (unitPrice == null) {
          unitPrice = Number(
            Deno.env.get('MINIPAY_CHECKOUT_AMOUNT_DISPLAY')?.trim() || '0.10',
          )
        }
        if (
          productToken &&
          !tokenMatchesConfigured(productToken, configuredToken)
        ) {
          return json({
            success: false,
            error: 'Product payment currency is not supported for this checkout.',
          }, 400)
        }
      }

      const lineToken = productToken || configuredToken

      const unitRaw = parseUnitsDecimal(
        decimalAmountString(unitPrice, celoConfig.tokenDecimals),
        celoConfig.tokenDecimals,
      )
      const lineCryptoRaw = unitRaw * BigInt(line.quantity)
      totalCryptoRaw += lineCryptoRaw

      const energyPrice = Number(item.energy_points_price ?? 0)
      const energySnapshot = Number.isFinite(energyPrice)
        ? Math.max(0, Math.floor(energyPrice))
        : 0

      resolvedLines.push({
        marketplace_item_id: String(item.id),
        quantity: line.quantity,
        product_title_snapshot: String(item.title ?? 'Item'),
        energy_price_snapshot: energySnapshot,
        crypto_unit_display: `${decimalAmountString(unitPrice, celoConfig.tokenDecimals)} ${lineToken}`,
        crypto_unit_raw: unitRaw.toString(),
        token_symbol_snapshot: lineToken,
        stock_quantity: stock,
      })
      totalQuantity += line.quantity
      energyPointsTotal += energySnapshot * line.quantity
    }

    const tokenSymbol = configuredToken
    const marketplaceItemId = resolvedLines[0].marketplace_item_id
    const totalCryptoDisplay =
      `${formatUnits(totalCryptoRaw, celoConfig.tokenDecimals)} ${tokenSymbol}`
    const cartItemsSnapshot = resolvedLines.map((line) => ({
      marketplace_item_id: line.marketplace_item_id,
      quantity: line.quantity,
      product_title_snapshot: line.product_title_snapshot,
      energy_price_snapshot: line.energy_price_snapshot,
      crypto_unit_display: line.crypto_unit_display,
      crypto_unit_raw: line.crypto_unit_raw,
      token_symbol_snapshot: line.token_symbol_snapshot,
    }))

    const itemTitle = resolvedLines.length === 1
      ? resolvedLines[0].product_title_snapshot
      : `${resolvedLines.length} items (${totalQuantity} qty)`

    const rawToken = generateRawSessionToken()
    const tokenHash = await sha256Hex(rawToken)
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString()

    const { data: sessionRow, error: insErr } = await admin
      .from('marketplace_minipay_sessions')
      .insert({
        user_id: userId,
        marketplace_item_id: marketplaceItemId,
        session_token_hash: tokenHash,
        chain: 'celo',
        chain_id: celoConfig.chainId,
        provider: 'minipay',
        token_symbol: tokenSymbol,
        token_address: celoConfig.tokenAddress,
        token_decimals: celoConfig.tokenDecimals,
        crypto_amount_raw: totalCryptoRaw.toString(),
        crypto_amount_display: totalCryptoDisplay,
        treasury_address: celoConfig.treasuryAddress,
        status: 'pending',
        customer_name: customerName,
        phone_number: phoneNumber,
        email,
        delivery_address: deliveryAddress,
        comments,
        expires_at: expiresAt,
        cart_items: cartItemsSnapshot,
        total_quantity: totalQuantity,
        energy_points_total: energyPointsTotal,
      })
      .select('id')
      .single()

    if (insErr || !sessionRow?.id) {
      safeError('minipay_create_insert_failed', { message: insErr?.message })
      return json({ success: false, error: 'Failed to create checkout session' }, 500)
    }

    const checkoutUrl = buildCheckoutUrl(
      celoConfig.checkoutBaseUrl,
      sessionRow.id,
      rawToken,
    )

    safeLog('minipay_checkout_session_created', {
      session_id: sessionRow.id,
      user_id: userId,
      marketplace_item_id: marketplaceItemId,
      line_count: resolvedLines.length,
      total_quantity: totalQuantity,
      chain_id: celoConfig.chainId,
    })

    return json({
      success: true,
      checkout_url: checkoutUrl,
      session_id: sessionRow.id,
      session_token: rawToken,
      expires_at: expiresAt,
      chain_id: celoConfig.chainId,
      chain_name: 'Celo',
      token_symbol: tokenSymbol,
      token_address: celoConfig.tokenAddress,
      token_decimals: celoConfig.tokenDecimals,
      amount_display: totalCryptoDisplay,
      amount_raw: totalCryptoRaw.toString(),
      treasury_address: celoConfig.treasuryAddress,
      item_title: itemTitle,
      item_count: resolvedLines.length,
      total_quantity: totalQuantity,
      energy_points_total: energyPointsTotal,
      cart_items: cartItemsSnapshot,
      delivery_region: 'Philippines only',
    }, 200)
  } catch (e) {
    safeError('minipay_create_unhandled', { message: String(e) })
    return json({ success: false, error: 'Internal server error' }, 500)
  }
})
