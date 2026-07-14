/**
 * Create hosted MiniPay marketplace checkout session.
 * Energy may reduce remaining stablecoin as a server-calculated discount only.
 * When discount > 0, Energy is reserved atomically here (balance deducted + hold row).
 * verify-payment redeems the reservation; expire/fail releases it.
 */

import {
  buildCheckoutUrl,
  formatUnits,
  generateRawSessionToken,
  loadMinipayCeloConfig,
  parseUnitsDecimal,
  getDefaultMinipayTokenSymbol,
  resolveMinipayToken,
  sha256Hex,
} from './minipay_celo.ts'
import { safeError, safeLog } from './log_sanitize.ts'
import {
  enforceRateLimits,
  RATE_LIMIT_ERROR,
  readClientIpForRateLimit,
} from './rate_limit.ts'
import { isOfferExpiredRow, OFFER_EXPIRED_ERROR } from './marketplace_offer.ts'
import {
  calculateEnergyDiscount,
  mergeProductDiscountFlags,
  parsePaymentSettingsRow,
} from './energy_discount.ts'
import {
  ENERGY_BALANCE_CHANGED_ERROR,
  parseEnergyReservationRpc,
} from './energy_reservation.ts'

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

    // Client sends symbol only — server resolves address/decimals from allowlist/registry.
    // crypto_price is USD stable face value; product.crypto_currency is display-only (not a blocker).
    const requestedSymbol =
      body.payment_token_symbol ?? body.token_symbol ?? getDefaultMinipayTokenSymbol()
    const paymentToken = resolveMinipayToken(requestedSymbol)
    if (!paymentToken) {
      return json({
        success: false,
        error: 'Unsupported payment token. Use cUSD, USDT, or USDC.',
      }, 400)
    }

    const ids = cartInputs.map((line) => line.id)
    const { data: itemRows, error: itemsErr } = await admin
      .from('marketplace_items')
      .select(
        'id, title, is_available, is_deleted, stock_quantity, energy_points_price, crypto_price, crypto_currency, is_limited_offer, offer_ends_at, allow_energy_discount, max_energy_discount_percent, allow_full_energy_payment',
      )
      .in('id', ids)

    if (itemsErr) {
      safeError('minipay_create_items_fetch_failed', { message: itemsErr.message })
      return json({ success: false, error: 'Could not load products' }, 500)
    }

    const { data: settingsRow } = await admin
      .from('marketplace_payment_settings')
      .select(
        'energy_php_value, php_per_cusd, max_energy_discount_percent, max_energy_discount_amount_php, allow_full_energy_payment',
      )
      .limit(1)
      .maybeSingle()
    const paymentSettings = parsePaymentSettingsRow(settingsRow as Record<string, unknown> | null)

    // Move+ marketplace capability session (not Supabase JWT). Required for Energy discount.
    const marketplaceSessionToken = trimField(body.marketplace_session_token, 128)
    let moveplusUserId: string | null = null
    let userEnergyBalance: number | null = null
    if (marketplaceSessionToken.length >= 32) {
      const sessionHash = await sha256Hex(marketplaceSessionToken)
      const { data: webSession } = await admin
        .from('marketplace_web_sessions')
        .select('id, user_id, expires_at, revoked_at')
        .eq('session_hash', sessionHash)
        .maybeSingle()
      if (
        webSession &&
        !webSession.revoked_at &&
        new Date(String(webSession.expires_at)).getTime() > Date.now()
      ) {
        moveplusUserId = String(webSession.user_id)
        const { data: profile } = await admin
          .from('users')
          .select('energy_points')
          .eq('id', moveplusUserId)
          .maybeSingle()
        userEnergyBalance = Math.max(0, Math.floor(Number(profile?.energy_points ?? 0) || 0))
        await admin
          .from('marketplace_web_sessions')
          .update({ last_seen_at: new Date().toISOString() })
          .eq('id', webSession.id)
      }
    }

    const requestedEnergyDiscount = Math.max(
      0,
      Math.floor(Number(body.requested_energy_discount ?? body.energy_to_apply ?? 0) || 0),
    )

    const itemById = new Map(
      (itemRows ?? []).map((row) => [String(row.id), row]),
    )

    const resolvedLines: CartLineResolved[] = []
    let totalQuantity = 0
    let energyPointsTotal = 0
    let totalCryptoRaw = 0n
    let totalCryptoFace = 0
    const demoMode = isDemoCheckoutMode()
    const tokenDecimals = paymentToken.decimals
    const tokenSymbol = paymentToken.symbol
    const tokenAddress = paymentToken.address.toLowerCase()

    for (const line of cartInputs) {
      const item = itemById.get(line.id)
      if (!item) {
        return json({ success: false, error: 'Product not found' }, 404)
      }
      if (item.is_deleted === true || item.is_available !== true) {
        return json({ success: false, error: `Product unavailable: ${item.title ?? line.id}` }, 400)
      }

      if (isOfferExpiredRow(item)) {
        return json({ success: false, error: OFFER_EXPIRED_ERROR }, 400)
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

      // crypto_price is USD stablecoin price (same numeric value for USDT/USDC/cUSD).
      let unitPrice = readPositiveDecimal(item.crypto_price)

      if (!demoMode) {
        if (unitPrice == null) {
          return json({
            success: false,
            error: `Product missing crypto price: ${item.title ?? line.id}`,
          }, 400)
        }
      } else if (unitPrice == null) {
        unitPrice = Number(celoConfig.demoAmountDisplay || '0.10')
      }

      const unitRaw = parseUnitsDecimal(
        decimalAmountString(unitPrice, tokenDecimals),
        tokenDecimals,
      )
      const lineCryptoRaw = unitRaw * BigInt(line.quantity)
      totalCryptoRaw += lineCryptoRaw
      totalCryptoFace += unitPrice * line.quantity

      const energyPrice = Number(item.energy_points_price ?? 0)
      const energySnapshot = Number.isFinite(energyPrice)
        ? Math.max(0, Math.floor(energyPrice))
        : 0

      resolvedLines.push({
        marketplace_item_id: String(item.id),
        quantity: line.quantity,
        product_title_snapshot: String(item.title ?? 'Item'),
        energy_price_snapshot: energySnapshot,
        crypto_unit_display: `${decimalAmountString(unitPrice, tokenDecimals)} ${tokenSymbol}`,
        crypto_unit_raw: unitRaw.toString(),
        token_symbol_snapshot: tokenSymbol,
        stock_quantity: stock,
      })
      totalQuantity += line.quantity
      energyPointsTotal += energySnapshot * line.quantity
    }

    const productFlags = mergeProductDiscountFlags(
      (itemRows ?? []) as Array<Record<string, unknown>>,
    )
    const discount = calculateEnergyDiscount({
      cryptoTotal: totalCryptoFace,
      requestedEnergy: requestedEnergyDiscount,
      userEnergyBalance,
      settings: paymentSettings,
      productFlags,
      moveplusAuthenticated: Boolean(moveplusUserId),
    })

    const cryptoBeforeRaw = totalCryptoRaw
    let payableCryptoRaw = totalCryptoRaw
    let appliedEnergy = discount.applied_energy
    let discountPhp = discount.discount_php
    let discountCrypto = discount.discount_crypto
    let remainingCrypto = discount.remaining_crypto
    let discountReason = discount.reason

    if (appliedEnergy > 0 && discountCrypto > 0) {
      payableCryptoRaw = parseUnitsDecimal(
        decimalAmountString(remainingCrypto, tokenDecimals),
        tokenDecimals,
      )
      // Guard: remaining must be > 0 unless full Energy payment explicitly allowed.
      if (payableCryptoRaw <= 0n && !discount.allow_full_energy) {
        payableCryptoRaw = totalCryptoRaw
        appliedEnergy = 0
        discountPhp = 0
        discountCrypto = 0
        remainingCrypto = totalCryptoFace
        discountReason = 'full_energy_blocked'
      }
    }

    const marketplaceItemId = resolvedLines[0].marketplace_item_id
    const totalCryptoDisplay =
      `${formatUnits(payableCryptoRaw, tokenDecimals)} ${tokenSymbol}`
    const cartItemsSnapshot = resolvedLines.map((line) => ({
      marketplace_item_id: line.marketplace_item_id,
      quantity: line.quantity,
      product_title_snapshot: line.product_title_snapshot,
      energy_price_snapshot: line.energy_price_snapshot,
      crypto_unit_display: line.crypto_unit_display,
      crypto_unit_raw: line.crypto_unit_raw,
      token_symbol_snapshot: line.token_symbol_snapshot,
    }))

    let energyDiscountSnapshot: Record<string, unknown> = {
      energy_php_value: paymentSettings.energy_php_value,
      php_per_cusd: paymentSettings.php_per_cusd,
      max_energy_discount_percent: paymentSettings.max_energy_discount_percent,
      effective_max_percent: discount.effective_max_percent,
      requested_energy: requestedEnergyDiscount,
      applied_energy: appliedEnergy,
      max_energy_allowed: discount.max_energy_allowed,
      user_energy_balance: userEnergyBalance,
      discount_php: discountPhp,
      discount_crypto: discountCrypto,
      crypto_before: discount.crypto_before,
      crypto_remaining: remainingCrypto,
      allow_full_energy: discount.allow_full_energy,
      moveplus_authenticated: Boolean(moveplusUserId),
      reason: discountReason,
    }

    const itemTitle = resolvedLines.length === 1
      ? resolvedLines[0].product_title_snapshot
      : `${resolvedLines.length} items (${totalQuantity} qty)`

    const rawToken = generateRawSessionToken()
    const tokenHash = await sha256Hex(rawToken)
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString()

    if (appliedEnergy > 0 && !moveplusUserId) {
      return json({
        success: false,
        error: 'Link your Move+ account to apply an Energy discount.',
      }, 401)
    }

    const sessionUserId = moveplusUserId ?? userId

    const { data: sessionRow, error: insErr } = await admin
      .from('marketplace_minipay_sessions')
      .insert({
        user_id: sessionUserId,
        marketplace_item_id: marketplaceItemId,
        session_token_hash: tokenHash,
        chain: 'celo',
        chain_id: celoConfig.chainId,
        provider: 'minipay',
        token_symbol: tokenSymbol,
        token_address: tokenAddress,
        token_decimals: tokenDecimals,
        crypto_amount_raw: payableCryptoRaw.toString(),
        crypto_amount_display: totalCryptoDisplay,
        crypto_amount_before_discount_raw: cryptoBeforeRaw.toString(),
        energy_discount_energy: appliedEnergy,
        energy_discount_php: discountPhp,
        energy_discount_crypto: discountCrypto,
        energy_discount_snapshot: energyDiscountSnapshot,
        energy_discount_status: 'none',
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

    let energyDiscountStatus: string = 'none'
    let energyReservationId: string | null = null

    if (appliedEnergy > 0 && moveplusUserId) {
      const { data: reserveRaw, error: reserveErr } = await admin.rpc(
        'reserve_minipay_energy_discount',
        {
          p_session_id: sessionRow.id,
          p_user_id: moveplusUserId,
          p_energy_amount: appliedEnergy,
          p_expires_at: expiresAt,
        },
      )

      const reserve = parseEnergyReservationRpc(reserveRaw)
      if (reserveErr || !reserve.ok) {
        const code = reserve.error_code ?? reserveErr?.message ?? 'reserve_failed'
        safeError('minipay_energy_reserve_failed', {
          session_prefix: String(sessionRow.id).slice(0, 8),
          code,
        })
        await admin.from('marketplace_minipay_sessions').delete().eq('id', sessionRow.id)

        if (code === 'insufficient_balance') {
          return json({
            success: false,
            error: ENERGY_BALANCE_CHANGED_ERROR,
            error_code: 'insufficient_balance',
          }, 409)
        }

        return json({
          success: false,
          error: ENERGY_BALANCE_CHANGED_ERROR,
          error_code: code,
        }, 409)
      }

      energyDiscountStatus = 'reserved'
      energyReservationId = reserve.reservation_id ?? null
      energyDiscountSnapshot = {
        ...energyDiscountSnapshot,
        reservation_id: energyReservationId,
        energy_discount_status: 'reserved',
      }
    }

    const checkoutUrl = buildCheckoutUrl(
      celoConfig.checkoutBaseUrl,
      sessionRow.id,
      rawToken,
    )

    safeLog('minipay_checkout_session_created', {
      session_id: sessionRow.id,
      user_id: sessionUserId,
      marketplace_item_id: marketplaceItemId,
      line_count: resolvedLines.length,
      total_quantity: totalQuantity,
      chain_id: celoConfig.chainId,
      token_symbol: tokenSymbol,
      energy_discount_energy: appliedEnergy,
      energy_discount_status: energyDiscountStatus,
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
      token_address: tokenAddress,
      token_decimals: tokenDecimals,
      amount_display: totalCryptoDisplay,
      amount_raw: payableCryptoRaw.toString(),
      amount_before_discount_raw: cryptoBeforeRaw.toString(),
      treasury_address: celoConfig.treasuryAddress,
      item_title: itemTitle,
      item_count: resolvedLines.length,
      total_quantity: totalQuantity,
      energy_points_total: energyPointsTotal,
      energy_discount: energyDiscountSnapshot,
      energy_discount_status: energyDiscountStatus,
      energy_discount_reservation_id: energyReservationId,
      cart_items: cartItemsSnapshot,
      delivery_region: 'Philippines only',
      supported_tokens: ['USDT', 'USDC', 'cUSD'],
      payment_settings: {
        energy_php_value: paymentSettings.energy_php_value,
        php_per_cusd: paymentSettings.php_per_cusd,
        max_energy_discount_percent: paymentSettings.max_energy_discount_percent,
        allow_full_energy_payment: paymentSettings.allow_full_energy_payment,
      },
    }, 200)
  } catch (e) {
    safeError('minipay_create_unhandled', { message: String(e) })
    return json({ success: false, error: 'Internal server error' }, 500)
  }
})
