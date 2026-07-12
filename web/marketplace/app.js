/**
 * Move+ Web Marketplace — mobile-first catalog + MiniPay checkout bridge.
 * Wallet calls only when window.ethereum?.isMiniPay === true.
 */

const CATEGORIES = [
  'All',
  'Wearables',
  'Apparel',
  'Accessories',
  'Nutrition',
  'Recovery',
  'Vouchers',
]

const GEAR_CATEGORY_ORDER = ['All', 'Ronin', 'Base', 'Genesis', 'Shoebox', 'Founder', 'Cycling']
const GEAR_PLACEHOLDER_PATH = './assets/gear/gear_placeholder.png'

const ERC20_TRANSFER_SELECTOR = '0xa9059cbb'
const ERC20_BALANCE_OF_SELECTOR = '0x70a08231'
const CART_STORAGE_KEY = 'moveplus_web_marketplace_cart_v1'

/** Server-authoritative Celo MiniPay stablecoin registry (display + balance checks). */
const SUPPORTED_MINIPAY_TOKENS = {
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
  cUSD: {
    symbol: 'cUSD',
    address: '0x765DE816845861e75A25fCA122bb6898B8B1282a',
    decimals: 18,
  },
}
const MINIPAY_TOKEN_PRIORITY = ['USDT', 'USDC', 'cUSD']

const state = {
  view: 'catalog',
  catalogTab: 'real',
  items: [],
  gearItems: [],
  cart: [],
  selectedCategory: 'All',
  selectedItem: null,
  checkoutSession: null,
  autoPayAfterSession: false,
  paymentInFlight: false,
  selectedPaymentToken: 'USDT',
  loading: true,
  error: null,
  catalogMeta: null,
  isMiniPay: false,
  minipayWalletAddress: null,
  toastTimer: null,
  paymentDebug: {
    step: 'idle',
    lastError: null,
    providerDetected: false,
    isMiniPay: false,
    chainId: null,
    selectedAccount: null,
    tokenAddress: null,
    amountRaw: null,
    treasuryAddress: null,
    txHash: null,
    createSessionStatus: null,
    verifyStatus: null,
    walletBalanceRaw: null,
  },
  ui: {
    menuOpen: false,
    menuSettingsOpen: false,
    searchOpen: false,
    filterOpen: false,
    searchQuery: '',
  },
  filters: {
    sort: 'featured',
    availability: 'all',
    energyMin: '',
    energyMax: '',
  },
}

function cfg() {
  return window.MP_MARKETPLACE_CONFIG || window.MOVEPLUS_MARKETPLACE_CONFIG || {}
}

const ACCOUNT_LINK_STORAGE_KEY = 'moveplus_marketplace_account_linked_v1'
const ACCOUNT_SUMMARY_SESSION_KEY = 'moveplus_marketplace_account_summary_v1'
const WEB_SESSION_STORAGE_KEY = 'moveplus_marketplace_web_session_v1'
const ACCOUNT_LINK_ICON_PATH = './assets/icons/link-svgrepo-com.svg'
const ACCOUNT_WALLET_ICON_PATH = './assets/icons/wallet-2-svgrepo-com.svg'

function qs(name) {
  return new URLSearchParams(window.location.search).get(name)?.trim() ?? ''
}

function isDebugMode() {
  const d = qs('debug')
  return d === '1' || d === 'true'
}

function logDebug(...args) {
  if (isDebugMode()) console.log('[moveplus-marketplace]', ...args)
}

function setPaymentDebug(patch) {
  state.paymentDebug = {
    ...state.paymentDebug,
    ...patch,
  }
  logDebug('payment', state.paymentDebug.step, patch)
  const stepEl = document.getElementById('payment-debug-step')
  const errEl = document.getElementById('payment-debug-error')
  if (stepEl) stepEl.textContent = state.paymentDebug.step || 'idle'
  if (errEl) errEl.textContent = state.paymentDebug.lastError || '—'
}

function isUserCancelledWalletError(err) {
  const msg = String(err?.message ?? err ?? '').toLowerCase()
  const code = err?.code
  return (
    code === 4001 ||
    code === '4001' ||
    msg.includes('user rejected') ||
    msg.includes('user denied') ||
    msg.includes('rejected') ||
    msg.includes('denied') ||
    msg.includes('cancelled') ||
    msg.includes('canceled')
  )
}

function showCheckoutStatus(html) {
  const statusEl = document.getElementById('checkout-status')
  if (statusEl) statusEl.innerHTML = html
}

function showPaymentStatus(html, { error = false } = {}) {
  const statusBox = document.getElementById('payment-status-box')
  if (!statusBox) return
  statusBox.style.display = 'block'
  statusBox.innerHTML = html
  if (error) {
    showToast(String(error === true ? 'Payment failed' : error), null, null)
  }
}

function insufficientTokenMessage(symbol) {
  const s = String(symbol || 'token')
  return `Insufficient ${s} balance. Please add ${s} to your MiniPay wallet or choose another token.`
}

function resolvePaymentToken(symbolInput) {
  const raw = String(symbolInput ?? '').trim()
  if (!raw) return null
  if (SUPPORTED_MINIPAY_TOKENS[raw]) return SUPPORTED_MINIPAY_TOKENS[raw]
  const upper = raw.toUpperCase()
  if (upper === 'USDT') return SUPPORTED_MINIPAY_TOKENS.USDT
  if (upper === 'USDC') return SUPPORTED_MINIPAY_TOKENS.USDC
  if (upper === 'CUSD') return SUPPORTED_MINIPAY_TOKENS.cUSD
  return null
}

function getSelectedPaymentToken() {
  return resolvePaymentToken(state.selectedPaymentToken) || SUPPORTED_MINIPAY_TOKENS.USDT
}

function parseUsdPriceToRaw(amount, decimals) {
  const n = Number(amount)
  if (!Number.isFinite(n) || n <= 0) return null
  const fixed = n.toFixed(Math.min(8, decimals)).replace(/\.?0+$/, '') || '0'
  const [whole, frac = ''] = fixed.split('.')
  const fracPadded = (frac + '0'.repeat(decimals)).slice(0, decimals)
  const combined = `${whole}${fracPadded}`.replace(/^0+/, '') || '0'
  return BigInt(combined)
}

function estimateRequiredRawForCart(tokenInfo) {
  const lines = getCartLines()
  let total = 0n
  for (const line of lines) {
    const unit = Number(line.product.cryptoPrice)
    if (!Number.isFinite(unit) || unit <= 0) return null
    const unitRaw = parseUsdPriceToRaw(unit, tokenInfo.decimals)
    if (unitRaw == null) return null
    total += unitRaw * BigInt(line.quantity)
  }
  return total
}

async function pickDefaultPaymentToken(walletAddress) {
  const priority = MINIPAY_TOKEN_PRIORITY
  if (!walletAddress || !window.ethereum?.request) {
    return priority[0]
  }
  for (const symbol of priority) {
    const token = SUPPORTED_MINIPAY_TOKENS[symbol]
    try {
      const bal = await fetchErc20BalanceRaw(token.address, walletAddress)
      const required = estimateRequiredRawForCart(token)
      if (required != null && bal >= required) return symbol
    } catch (_) {
      /* try next */
    }
  }
  return priority[0]
}

function cartHasMissingCryptoPrice() {
  return getCartLines().some((line) => {
    const price = Number(line.product.cryptoPrice)
    return !Number.isFinite(price) || price <= 0
  })
}

function isDemoMode() {
  const c = cfg()
  return c.demoMode === true || c.DEMO_MODE === true
}

function isDigitalGearEnabled() {
  const c = cfg()
  const flag = c.showDigitalGear ?? c.SHOW_DIGITAL_GEAR
  return flag === true || flag === 'true' || flag === 1 || flag === '1'
}

function forceRealCatalogIfGearHidden() {
  if (isDigitalGearEnabled()) return
  if (state.catalogTab !== 'real') {
    state.catalogTab = 'real'
    state.selectedCategory = 'All'
  }
  if (state.view === 'detail' && isDigitalGear(state.selectedItem)) {
    state.selectedItem = null
    state.view = 'catalog'
  }
}

function isMiniPayWallet() {
  return Boolean(window.ethereum && window.ethereum.isMiniPay)
}

/** MiniPay auto-connect: no manual Connect Wallet UI; provider is prepared on load. */
async function prepareMiniPayWallet() {
  if (!isMiniPayWallet()) {
    state.minipayWalletAddress = null
    return null
  }
  try {
    let accounts = await window.ethereum.request({ method: 'eth_accounts' })
    if (!accounts?.[0]) {
      accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
    }
    const payer = normalizeAddr(accounts?.[0])
    state.minipayWalletAddress = payer
    syncMiniPayWalletDisplay()
    return payer
  } catch (_) {
    state.minipayWalletAddress = null
    return null
  }
}

function syncMiniPayWalletDisplay() {
  const walletLine = document.getElementById('wallet-line')
  const walletAddrEl = document.getElementById('wallet-addr')
  if (!walletLine || !walletAddrEl) return
  if (state.minipayWalletAddress) {
    walletLine.style.display = 'flex'
    walletAddrEl.textContent = shortAddr(state.minipayWalletAddress)
  }
}

function parseImageList(value) {
  if (value == null || value === '') return []
  if (Array.isArray(value)) return value.filter(Boolean).map(String)
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return []
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed)
        return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : []
      } catch (_) {
        return [trimmed]
      }
    }
    return [trimmed]
  }
  return []
}

function resolveProductImage(row) {
  const images = resolveProductImages(row)
  return images[0] ?? null
}

function resolveProductImages(row) {
  const fromArray = parseImageList(row.image_urls)
  if (fromArray.length > 0) {
    return fromArray.map((url) => resolveImageUrl(url)).filter(Boolean)
  }
  const single = resolveImageUrl(row.image_url)
  return single ? [single] : []
}

function readBoolField(value, defaultWhenNull = false) {
  if (value === true || value === 'true' || value === 1 || value === '1') return true
  if (value === false || value === 'false' || value === 0 || value === '0') return false
  if (value === null || value === undefined || value === '') return defaultWhenNull
  return Boolean(value)
}

function parseOfferEndsAt(value) {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function isOfferExpiredRow(row, now = new Date()) {
  const limited = readBoolField(row.is_limited_offer, false)
  if (!limited) return false
  const ends = parseOfferEndsAt(row.offer_ends_at)
  if (!ends) return true
  return now.getTime() >= ends.getTime()
}

function isOfferExpiredProduct(product, now = new Date()) {
  if (!product?.isLimitedOffer) return false
  const ends = product.offerEndsAt
  if (!ends) return true
  return now.getTime() >= ends.getTime()
}

function offerCountdownLabel(endsAt, now = new Date()) {
  if (!endsAt) return null
  const ms = endsAt.getTime() - now.getTime()
  if (ms <= 0) return 'Expired'
  const hours = Math.floor(ms / 3600000)
  if (hours >= 24) return `Ends in ${Math.ceil(hours / 24)}d`
  if (hours >= 1) return `Ends in ${hours}h`
  const minutes = Math.max(1, Math.ceil(ms / 60000))
  return `Ends in ${minutes}m`
}

function offerBadgeLabel(product) {
  const custom = String(product.offerLabel ?? '').trim()
  return custom || 'Limited offer'
}

/**
 * Map Supabase marketplace_items row to web catalog product.
 * stock_quantity: null = untracked, 0 = sold out, >0 = capped quantity.
 */
function normalizeMarketplaceProduct(row) {
  const stockRaw = row.stock_quantity
  const stock =
    stockRaw == null || stockRaw === ''
      ? null
      : Number.isFinite(Number(stockRaw))
        ? Number(stockRaw)
        : null

  const isDeleted = readBoolField(row.is_deleted, false)
  const isAvailableFlag = readBoolField(row.is_available, true)
  const isLimitedOffer = readBoolField(row.is_limited_offer, false)
  const offerEndsAt = parseOfferEndsAt(row.offer_ends_at)
  const offerLabel = String(row.offer_label ?? '').trim() || null
  const offerExpired = isLimitedOffer && isOfferExpiredRow(row)
  const isAvailable = isAvailableFlag && !isDeleted && !offerExpired

  const isSoldOut = !isAvailable || (stock !== null && stock === 0)

  const cryptoPriceRaw = row.crypto_price
  const cryptoPriceNum =
    cryptoPriceRaw != null && cryptoPriceRaw !== ''
      ? Number(cryptoPriceRaw)
      : NaN
  const cryptoPrice =
    Number.isFinite(cryptoPriceNum) && cryptoPriceNum > 0 ? cryptoPriceNum : null
  const cryptoSymbol = String(row.crypto_currency ?? '').trim() || null

  return {
    id: String(row.id ?? ''),
    title: String(row.title ?? ''),
    description: String(row.description ?? ''),
    category: String(row.category ?? ''),
    imageUrl: resolveProductImage(row),
    images: resolveProductImages(row),
    energyPrice: Number(row.energy_points_price ?? 0),
    cryptoPrice,
    cryptoSymbol,
    stock,
    isAvailable,
    isSoldOut,
    isLimitedOffer,
    offerEndsAt,
    offerLabel,
    offerExpired,
    offerCountdown:
      isLimitedOffer && offerEndsAt && !offerExpired
        ? offerCountdownLabel(offerEndsAt)
        : null,
    createdAt: row.created_at ?? null,
  }
}

function stockDisplayLabel(product) {
  if (!product.isAvailable) return 'Unavailable'
  if (product.stock === 0) return 'Sold out'
  if (product.stock == null) return 'Available'
  return String(product.stock)
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function shortAddr(addr) {
  if (!addr || addr.length < 12) return addr ?? '—'
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function normalizeAddr(a) {
  const s = String(a ?? '').trim().toLowerCase()
  return /^0x[a-f0-9]{40}$/.test(s) ? s : null
}

function encodeErc20Transfer(to, amountRaw) {
  const toNorm = normalizeAddr(to)
  if (!toNorm) throw new Error('Invalid treasury address')
  const toPadded = toNorm.slice(2).padStart(64, '0')
  const amount = BigInt(amountRaw)
  const amountHex = amount.toString(16).padStart(64, '0')
  return `${ERC20_TRANSFER_SELECTOR}${toPadded}${amountHex}`
}

function encodeErc20BalanceOf(owner) {
  const ownerNorm = normalizeAddr(owner)
  if (!ownerNorm) throw new Error('Invalid wallet address')
  const ownerPadded = ownerNorm.slice(2).padStart(64, '0')
  return `${ERC20_BALANCE_OF_SELECTOR}${ownerPadded}`
}

async function fetchErc20BalanceRaw(tokenAddress, ownerAddress) {
  const token = normalizeAddr(tokenAddress)
  const owner = normalizeAddr(ownerAddress)
  if (!token || !owner) throw new Error('Invalid token or wallet for balance check')
  if (!window.ethereum?.request) throw new Error('Wallet provider unavailable')

  const result = await window.ethereum.request({
    method: 'eth_call',
    params: [
      {
        to: token,
        data: encodeErc20BalanceOf(owner),
      },
      'latest',
    ],
  })

  const hex = String(result ?? '0x').trim()
  if (!hex || hex === '0x') return 0n
  return BigInt(hex)
}

function isInsufficientBalanceError(err) {
  const msg = String(err?.message ?? err ?? '').toLowerCase()
  const data = String(err?.data ?? err?.error?.message ?? '').toLowerCase()
  const combined = `${msg} ${data}`
  return (
    combined.includes('transfer amount exceeds balance') ||
    combined.includes('insufficient funds') ||
    combined.includes('exceeds balance') ||
    combined.includes('insufficient balance') ||
    combined.includes('erc20: transfer amount exceeds balance')
  )
}

function friendlyPaymentError(err, tokenSymbol) {
  if (isUserCancelledWalletError(err)) return 'Payment cancelled'
  if (isInsufficientBalanceError(err)) return insufficientTokenMessage(tokenSymbol || getSelectedPaymentToken().symbol)

  const raw = String(err?.message ?? err ?? 'Payment failed')
  // Hide JSON-RPC / eth_estimateGas noise from normal users
  const looksRawRpc =
    raw.includes('eth_estimateGas') ||
    raw.includes('Internal JSON-RPC') ||
    raw.includes('execution reverted') ||
    raw.includes('{') ||
    raw.toLowerCase().includes('json-rpc')

  if (looksRawRpc && !isDebugMode()) {
    return 'Payment could not be completed. Please try again or choose another token.'
  }
  return raw
}

function chainIdHex(chainId) {
  return `0x${Number(chainId).toString(16)}`
}

function resolveImageUrl(url) {
  if (!url) return null
  const trimmed = String(url).trim()
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  const c = cfg()
  if (!c.supabaseUrl) return trimmed
  const bucket = c.storageBucket || 'marketplace_images'
  const path = trimmed.replace(/^\//, '')
  return `${c.supabaseUrl}/storage/v1/object/public/${bucket}/${path}`
}

function formatProductCryptoLabel(product) {
  if (!product || product.cryptoPrice == null) return null
  const amount = Number(product.cryptoPrice)
  if (!Number.isFinite(amount) || amount <= 0) return null
  // crypto_price is USD stablecoin price (USDT/USDC/cUSD share the same number).
  return `${formatMoneyAmount(amount)} USD`
}

function formatMoneyAmount(amount) {
  const n = Number(amount)
  if (!Number.isFinite(n)) return '—'
  const rounded = Math.round(n * 100) / 100
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2)
}

function cryptoPriceLabel(product) {
  if (product) {
    const label = formatProductCryptoLabel(product)
    if (label) return label
  }
  return '—'
}

function sumCartCryptoTotals(lines) {
  let total = 0
  let hasPrice = false
  for (const line of lines) {
    const unit = Number(line.product.cryptoPrice)
    if (!Number.isFinite(unit) || unit <= 0) continue
    total += unit * line.quantity
    hasPrice = true
  }
  if (!hasPrice) {
    return { display: '—', tokenSymbol: null, hasPrice: false, usdTotal: 0 }
  }
  return {
    display: `${formatMoneyAmount(total)} USD`,
    tokenSymbol: getSelectedPaymentToken().symbol,
    hasPrice: true,
    usdTotal: total,
  }
}

/* ——— Cart (localStorage, product snapshots only — no PII) ——— */

function loadCartFromStorage() {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY)
    if (!raw) {
      state.cart = []
      return
    }
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      state.cart = []
      return
    }
    state.cart = parsed
      .filter((line) => line && line.productId && Number(line.quantity) > 0)
      .map((line) => ({
        productId: String(line.productId),
        quantity: Math.max(1, Math.floor(Number(line.quantity))),
        snapshot: line.snapshot ?? null,
      }))
  } catch (_) {
    state.cart = []
  }
}

function saveCartToStorage() {
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(state.cart))
  } catch (_) {
    /* memory-only fallback */
  }
}

function productSnapshot(product) {
  return {
    title: product.title,
    description: product.description,
    category: product.category,
    imageUrl: product.imageUrl,
    energyPrice: product.energyPrice,
    cryptoPrice: product.cryptoPrice,
    cryptoSymbol: product.cryptoSymbol,
    stock: product.stock,
    isSoldOut: product.isSoldOut,
    isAvailable: product.isAvailable,
    isLimitedOffer: product.isLimitedOffer,
    offerEndsAt: product.offerEndsAt ? product.offerEndsAt.toISOString() : null,
    offerLabel: product.offerLabel,
    offerExpired: product.offerExpired,
  }
}

function resolveLiveProduct(productId) {
  return state.items.find((p) => p.id === productId) ?? null
}

function resolveCartLine(line) {
  const live = resolveLiveProduct(line.productId)
  const snap = line.snapshot ?? {}
  const merged = live
    ? { ...snap, ...productSnapshot(live), productId: line.productId }
    : { ...snap, productId: line.productId }
  return {
    productId: line.productId,
    quantity: line.quantity,
    product: {
      id: line.productId,
      title: merged.title || 'Product',
      description: merged.description || '',
      category: merged.category || '',
      imageUrl: merged.imageUrl || null,
      energyPrice: Number(merged.energyPrice ?? 0),
      cryptoPrice: merged.cryptoPrice ?? null,
      cryptoSymbol: merged.cryptoSymbol || null,
      stock: merged.stock ?? null,
      isSoldOut: live ? live.isSoldOut : Boolean(merged.isSoldOut),
      isAvailable: live ? live.isAvailable : merged.isAvailable !== false,
      isLimitedOffer: live ? live.isLimitedOffer : Boolean(merged.isLimitedOffer),
      offerEndsAt: live?.offerEndsAt ?? (merged.offerEndsAt ? new Date(merged.offerEndsAt) : null),
      offerLabel: live?.offerLabel ?? merged.offerLabel ?? null,
      offerExpired: live ? live.offerExpired : Boolean(merged.offerExpired),
    },
    missing: !live && !snap.title,
  }
}

function getCartLines() {
  return state.cart.map(resolveCartLine).filter((line) => !line.missing)
}

function getCartItemCount() {
  return getCartLines().reduce((sum, line) => sum + line.quantity, 0)
}

function getMaxCartQuantity(product) {
  if (!product || product.isSoldOut) return 0
  if (product.stock === 0) return 0
  if (product.stock == null) return 99
  return Math.max(0, Math.min(99, product.stock))
}

function syncCartBadge() {
  const badge = document.getElementById('cart-badge')
  if (!badge) return
  const count = getCartItemCount()
  badge.textContent = String(count > 99 ? '99+' : count)
  badge.classList.toggle('hidden', count <= 0)
}

function showToast(message, actionLabel, actionFn) {
  const el = document.getElementById('mp-toast')
  if (!el) return
  if (state.toastTimer) clearTimeout(state.toastTimer)
  el.classList.remove('hidden')
  el.innerHTML = `
    <span class="mp-toast-message">${escapeHtml(message)}</span>
    ${actionLabel ? `<button type="button" class="mp-toast-action" id="mp-toast-action">${escapeHtml(actionLabel)}</button>` : ''}
  `
  document.getElementById('mp-toast-action')?.addEventListener('click', () => {
    actionFn?.()
    hideToast()
  })
  state.toastTimer = setTimeout(hideToast, 4000)
}

function hideToast() {
  const el = document.getElementById('mp-toast')
  if (!el) return
  el.classList.add('hidden')
  el.innerHTML = ''
  if (state.toastTimer) {
    clearTimeout(state.toastTimer)
    state.toastTimer = null
  }
}

function addToCart(product, quantity = 1) {
  if (!product || isDigitalGear(product) || state.catalogTab === 'gear') return false
  if (product.isSoldOut || product.offerExpired) {
    if (product.offerExpired) showToast('This offer has expired.', null, null)
    return false
  }
  const qty = Math.max(1, Math.floor(Number(quantity) || 1))
  const max = getMaxCartQuantity(product)
  if (max <= 0) return false

  const existing = state.cart.find((line) => line.productId === product.id)
  const nextQty = Math.min(max, (existing?.quantity ?? 0) + qty)
  if (existing) {
    existing.quantity = nextQty
    existing.snapshot = productSnapshot(product)
  } else {
    state.cart.push({
      productId: product.id,
      quantity: Math.min(max, qty),
      snapshot: productSnapshot(product),
    })
  }
  saveCartToStorage()
  syncCartBadge()
  showToast('Added to cart', 'View cart', () => setView('cart'))
  return true
}

function setCartLineQuantity(productId, quantity) {
  const line = state.cart.find((l) => l.productId === productId)
  if (!line) return
  const live = resolveLiveProduct(productId)
  const max = live ? getMaxCartQuantity(live) : 99
  const qty = Math.max(1, Math.min(max || 99, Math.floor(Number(quantity) || 1)))
  line.quantity = qty
  if (live) line.snapshot = productSnapshot(live)
  saveCartToStorage()
  syncCartBadge()
}

function removeFromCart(productId) {
  state.cart = state.cart.filter((line) => line.productId !== productId)
  saveCartToStorage()
  syncCartBadge()
  showToast('Item removed', null, null)
}

function clearCart() {
  state.cart = []
  saveCartToStorage()
  syncCartBadge()
}

function getCartTotals() {
  const lines = getCartLines()
  const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0)
  const totalEnergy = lines.reduce(
    (sum, line) => sum + line.product.energyPrice * line.quantity,
    0,
  )
  const crypto = sumCartCryptoTotals(lines)
  return {
    lines,
    totalQuantity,
    totalEnergy,
    cryptoSubtotal: crypto.display,
    tokenSymbol: crypto.tokenSymbol,
    hasCryptoPrices: crypto.hasPrice,
  }
}

function buildCheckoutItemsPayload() {
  return getCartLines().map((line) => ({
    marketplace_item_id: line.productId,
    quantity: line.quantity,
  }))
}

function cartHasUnavailableItems() {
  return getCartLines().some(
    (line) =>
      line.product.isSoldOut ||
      !line.product.isAvailable ||
      line.product.offerExpired ||
      isOfferExpiredProduct(line.product),
  )
}

/** Refresh cart snapshots from latest catalog rows (never trust stale localStorage crypto). */
function refreshCartSnapshotsFromCatalog() {
  let updated = false
  for (const line of state.cart) {
    const live = resolveLiveProduct(line.productId)
    if (!live) continue
    const nextSnap = productSnapshot(live)
    const prev = line.snapshot || {}
    if (
      prev.cryptoPrice !== nextSnap.cryptoPrice ||
      prev.cryptoSymbol !== nextSnap.cryptoSymbol ||
      prev.energyPrice !== nextSnap.energyPrice ||
      prev.isSoldOut !== nextSnap.isSoldOut ||
      prev.offerExpired !== nextSnap.offerExpired
    ) {
      updated = true
    }
    line.snapshot = nextSnap
  }
  // Drop lines whose product vanished from catalog
  const before = state.cart.length
  state.cart = state.cart.filter((line) => resolveLiveProduct(line.productId))
  if (state.cart.length !== before) updated = true
  if (updated) saveCartToStorage()
  syncCartBadge()
  return updated
}

async function ensureCatalogFreshForCheckout() {
  if (!state.items.length) {
    await loadCatalog()
  } else {
    // Soft refresh so checkout uses latest crypto_price / crypto_currency
    try {
      const table = cfg().catalogTable || cfg().marketplaceTable || 'marketplace_items'
      const select =
        'id,title,description,image_url,energy_points_price,crypto_price,crypto_currency,category,stock_quantity,is_available,is_deleted,is_limited_offer,offer_ends_at,offer_label,created_at,updated_at'
      const query = `${table}?select=${select}&is_available=eq.true&is_deleted=eq.false&order=created_at.desc`
      let rows = await supabaseRest(query)
      if (!Array.isArray(rows)) rows = []
      state.items = rows.map(normalizeMarketplaceProduct).filter((p) => p.id && p.isAvailable && !p.offerExpired)
    } catch (err) {
      logDebug('checkout catalog refresh failed', err)
    }
  }
  refreshCartSnapshotsFromCatalog()
}

function formatEnergyPriceHtml(amount) {
  const formatted = Number(amount).toLocaleString()
  return `<span class="price-energy-row"><span class="price-energy">${formatted}</span><img src="assets/icons/ic_energy.png" alt="" class="energy-icon" width="16" height="16" /></span>`
}

function isDigitalGear(item) {
  return Boolean(item && (item.chain || item.filterChain) && item.gearType)
}

function loadGearPreview() {
  const rows = window.MOVEPLUS_DIGITAL_GEAR_PREVIEW
  state.gearItems = Array.isArray(rows)
    ? rows.map((row) => ({
        ...row,
        id: String(row.id ?? ''),
        imageUrl: row.imageUrl || GEAR_PLACEHOLDER_PATH,
        fallbackImageUrl: row.fallbackImageUrl || row.imageUrl || GEAR_PLACEHOLDER_PATH,
        cidImageUrl: row.cidImageUrl ?? null,
      }))
    : []
}

function getGearCategories() {
  const cats = new Set(['All', 'Cycling'])
  for (const gear of state.gearItems) {
    if (gear.filterChain) cats.add(gear.filterChain)
    if (gear.filterCategory) cats.add(gear.filterCategory)
  }
  return GEAR_CATEGORY_ORDER.filter((cat) => cats.has(cat))
}

function getActiveCategories() {
  return state.catalogTab === 'gear' ? getGearCategories() : CATEGORIES
}

function matchesGearCategory(gear, category) {
  if (category === 'All') return true
  if (category === 'Cycling') return false
  return (
    gear.filterChain === category ||
    gear.filterCategory === category ||
    gear.category === category
  )
}

function gearImageBlock(gear, { detail = false } = {}) {
  const primary = gear.imageUrl || GEAR_PLACEHOLDER_PATH
  const fallback = gear.fallbackImageUrl || GEAR_PLACEHOLDER_PATH
  const imgClass = detail ? 'gear-image detail-hero-img' : 'product-image gear-image'
  return `
    <img
      class="${imgClass}"
      src="${escapeHtml(primary)}"
      data-fallback="${escapeHtml(fallback)}"
      alt=""
      loading="lazy"
    />
    <div class="gear-image-fallback hidden" aria-hidden="true">Preview</div>
  `
}

function bindGearImageFallbacks(root) {
  root.querySelectorAll('img.gear-image').forEach((img) => {
    if (img.dataset.gearBound) return
    img.dataset.gearBound = '1'
    img.addEventListener('error', () => {
      const fallback = img.getAttribute('data-fallback') || GEAR_PLACEHOLDER_PATH
      if (!img.dataset.triedFallback && fallback) {
        img.dataset.triedFallback = '1'
        img.src = fallback
        return
      }
      img.classList.add('gear-image--failed')
      const wrap = img.closest('.product-image-wrap, .detail-hero')
      const block = wrap?.querySelector('.gear-image-fallback')
      if (block) block.classList.remove('hidden')
    })
  })
}

function marketplaceToggleHtml() {
  if (!isDigitalGearEnabled()) return ''
  return `
    <div class="marketplace-type-toggle" role="tablist" aria-label="Marketplace type">
      <button type="button" class="marketplace-type-btn ${state.catalogTab === 'real' ? 'active' : ''}" data-catalog-tab="real" role="tab" aria-selected="${state.catalogTab === 'real'}">Real Items</button>
      <button type="button" class="marketplace-type-btn ${state.catalogTab === 'gear' ? 'active' : ''}" data-catalog-tab="gear" role="tab" aria-selected="${state.catalogTab === 'gear'}">Digital Gear</button>
    </div>
  `
}

function setCatalogTab(tab) {
  if (!isDigitalGearEnabled() && tab === 'gear') {
    tab = 'real'
  }
  if (tab !== 'real' && tab !== 'gear') return
  if (state.catalogTab === tab) return
  state.catalogTab = tab
  state.selectedCategory = 'All'
  if (state.view === 'detail') {
    state.selectedItem = null
    state.view = 'catalog'
  }
  closeAllHeaderOverlays()
  syncSearchPlaceholder()
  render()
  syncWalletDetection()
}

function syncSearchPlaceholder() {
  const input = document.getElementById('search-input')
  if (!input) return
  input.placeholder =
    isDigitalGearEnabled() && state.catalogTab === 'gear'
      ? 'Search digital gear'
      : 'Search products'
}

function bindCatalogTabHandlers(root) {
  root.querySelectorAll('[data-catalog-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setCatalogTab(btn.getAttribute('data-catalog-tab') || 'real')
    })
  })
}

function bindCategoryChipHandlers(root) {
  root.querySelectorAll('[data-category]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.selectedCategory = btn.getAttribute('data-category') || 'All'
      render()
    })
  })
}

function friendlyFetchError(err) {
  const msg = String(err?.message ?? err)
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) {
    return 'Could not reach Move+ servers. Check your connection and try again.'
  }
  return 'Something went wrong. Please try again.'
}

function friendlyApiError(status, data) {
  if (data?.error && typeof data.error === 'string') return data.error
  if (status === 403) return 'Checkout link is invalid. Please start checkout again.'
  if (status === 404) return 'Product or checkout session not found.'
  if (status === 410 || data?.status === 'expired') {
    return 'Checkout session expired. Please start checkout again.'
  }
  if (status === 429) return 'Too many requests. Please wait and try again.'
  if (status === 503) return 'Checkout is temporarily unavailable.'
  return 'Could not complete checkout. Please try again.'
}

const VERIFY_PENDING_MESSAGE =
  'Payment may have been sent, but verification is pending. Please do not pay again. Tap Check Status or contact support with your transaction hash.'

function isVerifyPendingError(err, status) {
  if (status === 503 || status === 502 || status === 504) return true
  const msg = String(err?.message ?? err ?? '')
  return /failed to fetch|networkerror|load failed|network request failed|temporarily unavailable|internal server error|503/i.test(
    msg,
  )
}

function showVerifyPendingRecovery(session, txHash, payer) {
  const statusBox = document.getElementById('payment-status-box')
  const payBtn = document.getElementById('confirm-pay-btn')
  const liveStatus = document.getElementById('checkout-live-status')
  if (liveStatus) liveStatus.textContent = 'verify pending'
  if (payBtn) {
    payBtn.disabled = false
    payBtn.textContent = 'Check Status / Retry Verification'
  }

  const shortTx = shortAddr(String(txHash))
  const html =
    `<div class="alert alert-warn">${escapeHtml(VERIFY_PENDING_MESSAGE)}</div>` +
    `<div class="meta-row" style="margin-top:10px"><span class="meta-label">Tx hash</span><span class="meta-value">${escapeHtml(shortTx)}</span></div>` +
    (isDebugMode()
      ? `<div class="meta-row"><span class="meta-label">Full tx</span><span class="meta-value" style="word-break:break-all">${escapeHtml(String(txHash))}</span></div>`
      : '') +
    `<button type="button" class="btn btn-primary" id="retry-verify-btn" style="margin-top:12px">Check Status / Retry Verification</button>`

  if (statusBox) {
    statusBox.style.display = 'block'
    statusBox.innerHTML = html
  }
  showToast(VERIFY_PENDING_MESSAGE, null, null)

  // Persist submitted tx on session so retry does not create a new checkout.
  if (state.checkoutSession) {
    state.checkoutSession = {
      ...state.checkoutSession,
      ...session,
      txHash: String(txHash),
      payerWalletAddress: payer || state.checkoutSession.payerWalletAddress || null,
      verifyPending: true,
    }
  }

  document.getElementById('retry-verify-btn')?.addEventListener('click', () => {
    retryVerifyPayment(String(txHash), payer)
  })
  if (payBtn) {
    payBtn.onclick = () => retryVerifyPayment(String(txHash), payer)
  }
}

async function retryVerifyPayment(txHash, payer) {
  const session = state.checkoutSession
  if (!session?.sessionId || !session?.sessionToken || !txHash) {
    showToast('Missing payment session. Contact support with your transaction hash.', null, null)
    return
  }

  const payBtn = document.getElementById('confirm-pay-btn')
  const statusBox = document.getElementById('payment-status-box')
  const liveStatus = document.getElementById('checkout-live-status')
  const payerAddr = normalizeAddr(payer || session.payerWalletAddress || state.minipayWalletAddress)

  if (payBtn) {
    payBtn.disabled = true
    payBtn.textContent = 'Checking…'
  }
  if (liveStatus) liveStatus.textContent = 'verifying'
  showPaymentStatus(
    `<div class="alert alert-info">Retrying verification for ${escapeHtml(shortAddr(txHash))}…</div>`,
  )
  setPaymentDebug({ step: 'verify-retry-started', txHash: String(txHash), lastError: null })

  try {
    if (!payerAddr) throw new Error('Wallet address missing for verification retry')

    const { status, data } = await invokeVerify({
      session_id: session.sessionId,
      session_token: session.sessionToken,
      tx_hash: txHash,
      payer_wallet_address: payerAddr,
    })
    setPaymentDebug({
      step: 'verify-retry-response',
      verifyStatus: status,
      txHash: data?.tx_hash || String(txHash),
    })

    if (status === 202 || data?.status === 'submitted') {
      showVerifyPendingRecovery(session, txHash, payerAddr)
      showPaymentStatus(
        `<div class="alert alert-warn">Transaction found but not confirmed yet. ${escapeHtml(VERIFY_PENDING_MESSAGE)}</div>`,
      )
      return
    }

    if (!data?.success || data.status !== 'paid') {
      if (isVerifyPendingError(null, status)) {
        showVerifyPendingRecovery(session, txHash, payerAddr)
        return
      }
      throw new Error(friendlyApiError(status, data))
    }

    setPaymentDebug({ step: 'payment-successful', lastError: null })
    state.paymentInFlight = false
    setView('paid', {
      session: {
        ...session,
        txHash: data.tx_hash || String(txHash),
        explorerUrl: data.explorer_url,
        receiptTxHash: data.receipt_tx_hash ?? null,
        receiptExplorerUrl: data.receipt_explorer_url ?? null,
        receiptPending: data.receipt_pending === true,
        receiptRecorded: data.receipt_recorded === true || Boolean(data.receipt_tx_hash),
        verifyPending: false,
      },
    })
    clearCart()
  } catch (err) {
    logDebug('verify retry error', err)
    if (isDebugMode()) setPaymentDebug({ lastError: String(err?.message ?? err) })
    if (isVerifyPendingError(err)) {
      showVerifyPendingRecovery(session, txHash, payerAddr)
      return
    }
    const message = friendlyPaymentError(err, session.tokenSymbol)
    showPaymentStatus(`<div class="alert alert-error">${escapeHtml(message)}</div>`, { error: message })
    if (statusBox) {
      const retryBtn = document.createElement('button')
      retryBtn.type = 'button'
      retryBtn.className = 'btn btn-primary'
      retryBtn.id = 'retry-verify-btn'
      retryBtn.style.marginTop = '12px'
      retryBtn.textContent = 'Check Status / Retry Verification'
      statusBox.appendChild(retryBtn)
      retryBtn.addEventListener('click', () => retryVerifyPayment(String(txHash), payerAddr))
    }
    if (payBtn) {
      payBtn.disabled = false
      payBtn.textContent = 'Check Status / Retry Verification'
      payBtn.onclick = () => retryVerifyPayment(String(txHash), payerAddr)
    }
  }
}

async function supabaseRest(path, { method = 'GET', body } = {}) {
  const c = cfg()
  if (!c.supabaseUrl || !c.supabaseAnonKey) {
    throw new Error('Marketplace is not configured. Copy config.example.js to config.js.')
  }
  const url = `${c.supabaseUrl}/rest/v1/${path}`
  const headers = {
    apikey: c.supabaseAnonKey,
    Authorization: `Bearer ${c.supabaseAnonKey}`,
    Accept: 'application/json',
  }
  if (body) headers['Content-Type'] = 'application/json'

  let res
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch (err) {
    throw new Error(friendlyFetchError(err))
  }

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}))
    throw new Error(errBody.message || `Request failed (${res.status})`)
  }

  if (res.status === 204) return null
  return res.json()
}

async function invokeFunction(name, body) {
  const c = cfg()
  const url = `${c.supabaseUrl}/functions/v1/${name}`
  let res
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: c.supabaseAnonKey,
        Authorization: `Bearer ${c.supabaseAnonKey}`,
      },
      body: JSON.stringify(body),
    })
  } catch (err) {
    throw new Error(friendlyFetchError(err))
  }
  const data = await res.json().catch(() => ({}))
  return { status: res.status, data }
}

function demoProducts() {
  return [
    {
      id: 'demo-1',
      title: 'Move+ Running Cap',
      description: 'Lightweight cap for training. Demo product for empty catalog preview.',
      image_url: null,
      energy_points_price: 1200,
      crypto_price: 1.0,
      crypto_currency: 'cUSD',
      category: 'Apparel',
      stock_quantity: 5,
      is_available: true,
      is_deleted: false,
    },
  ]
}

async function loadCatalog() {
  state.loading = true
  state.error = null
  state.catalogMeta = null
  render()

  const table = cfg().catalogTable || cfg().marketplaceTable || 'marketplace_items'
  const sourceLabel = `Supabase ${table}`

  try {
    // Same filters as native SupabaseService.getMarketplaceItems()
    const select =
      'id,title,description,image_url,energy_points_price,crypto_price,crypto_currency,category,stock_quantity,is_available,is_deleted,is_limited_offer,offer_ends_at,offer_label,created_at,updated_at'
    const query = `${table}?select=${select}&is_available=eq.true&is_deleted=eq.false&order=created_at.desc`
    let rows = await supabaseRest(query)
    if (!Array.isArray(rows)) rows = []

    let products = rows.map(normalizeMarketplaceProduct).filter((p) => p.id && p.isAvailable && !p.offerExpired)

    if (products.length === 0 && isDemoMode()) {
      products = demoProducts().map(normalizeMarketplaceProduct)
      logDebug('demoMode enabled — using sample products')
    }

    state.catalogMeta = {
      source: sourceLabel,
      stockField: 'stock_quantity',
      availabilityField: 'is_available',
      rowCount: products.length,
      rawRowCount: rows.length,
      firstRowStock: rows[0]?.stock_quantity ?? '—',
      firstRowAvailable: rows[0]?.is_available ?? '—',
      firstProductIsSoldOut: products[0]?.isSoldOut ?? '—',
      demoMode: isDemoMode(),
    }

    state.items = products
    state.loading = false
    state.error = null
  } catch (err) {
    state.loading = false
    state.items = []
    state.error = 'Could not load marketplace products. Please try again.'
    state.catalogMeta = {
      source: sourceLabel,
      stockField: 'stock_quantity',
      availabilityField: 'is_available',
      rowCount: 0,
      rawRowCount: 0,
      firstRowStock: '—',
      firstRowAvailable: '—',
      firstProductIsSoldOut: '—',
      demoMode: isDemoMode(),
      fetchError: String(err?.message ?? err),
    }
    logDebug('catalog error', err)
  }

  render()
  syncWalletDetection()
}

function filteredItems() {
  let items = [...state.items]

  if (state.selectedCategory !== 'All') {
    items = items.filter((p) => p.category === state.selectedCategory)
  }

  const q = state.ui.searchQuery.trim().toLowerCase()
  if (q) {
    items = items.filter((p) => {
      const hay = `${p.title} ${p.description} ${p.category}`.toLowerCase()
      return hay.includes(q)
    })
  }

  const min = state.filters.energyMin !== '' ? Number(state.filters.energyMin) : null
  const max = state.filters.energyMax !== '' ? Number(state.filters.energyMax) : null
  if (min != null && Number.isFinite(min)) {
    items = items.filter((p) => p.energyPrice >= min)
  }
  if (max != null && Number.isFinite(max)) {
    items = items.filter((p) => p.energyPrice <= max)
  }

  if (state.filters.availability === 'available') {
    items = items.filter((p) => p.isAvailable && !p.isSoldOut)
  }

  switch (state.filters.sort) {
    case 'energy_low':
      items.sort((a, b) => a.energyPrice - b.energyPrice)
      break
    case 'energy_high':
      items.sort((a, b) => b.energyPrice - a.energyPrice)
      break
    case 'newest':
      items.sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
      break
    default:
      break
  }

  return items
}

function filteredGearItems() {
  let items = [...state.gearItems]

  if (state.selectedCategory !== 'All') {
    items = items.filter((gear) => matchesGearCategory(gear, state.selectedCategory))
  }

  const q = state.ui.searchQuery.trim().toLowerCase()
  if (q) {
    items = items.filter((gear) => {
      const hay = `${gear.title} ${gear.description} ${gear.chain} ${gear.gearType} ${gear.rarity} ${gear.category} ${gear.filterCategory || ''}`.toLowerCase()
      return hay.includes(q)
    })
  }

  if (state.filters.sort === 'newest') {
    items.sort((a, b) => String(a.title).localeCompare(String(b.title)))
  }

  return items
}

function hasActiveFilters() {
  if (isDigitalGearEnabled() && state.catalogTab === 'gear') {
    return state.selectedCategory !== 'All' || state.filters.sort !== 'featured'
  }
  return (
    state.filters.sort !== 'featured' ||
    state.filters.availability !== 'all' ||
    state.filters.energyMin !== '' ||
    state.filters.energyMax !== ''
  )
}

function setView(view, payload = {}) {
  forceRealCatalogIfGearHidden()

  // Apply session payload BEFORE payment-view guards (otherwise payment never opens).
  if (payload.item) state.selectedItem = payload.item
  if (Object.prototype.hasOwnProperty.call(payload, 'session')) {
    state.checkoutSession = payload.session
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'autoPay')) {
    state.autoPayAfterSession = Boolean(payload.autoPay)
  }

  if (view === 'payment' && !state.checkoutSession) {
    logDebug('setView payment blocked — missing checkoutSession')
    view = state.cart.length > 0 ? 'checkout' : 'catalog'
  }
  // Payment view may keep an empty cart after success path; only guard checkout.
  if (view === 'checkout' && (state.catalogTab !== 'real' || getCartLines().length === 0)) {
    view = 'cart'
  }
  if (view === 'payment' && state.catalogTab !== 'real') {
    view = 'cart'
  }

  state.view = view
  closeAllHeaderOverlays()
  hideToast()
  render()
  syncWalletDetection()
  syncCartBadge()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function syncWalletDetection() {
  state.isMiniPay = isMiniPayWallet()
  if (state.isMiniPay) {
    prepareMiniPayWallet()
  } else {
    state.minipayWalletAddress = null
  }
}

function productCardHtml(product) {
  const img = product.imageUrl
  const imageBlock = img
    ? `<img class="product-image" src="${escapeHtml(img)}" alt="" loading="lazy" />`
    : `<div class="product-image placeholder">No image</div>`
  const cryptoLabel = formatProductCryptoLabel(product) || '—'

  const offerBadge =
    product.isLimitedOffer && product.offerCountdown
      ? `<span class="badge offer-badge">${escapeHtml(product.offerCountdown)}</span>`
      : product.isLimitedOffer
        ? `<span class="badge offer-badge">${escapeHtml(offerBadgeLabel(product))}</span>`
        : ''

  return `
    <button type="button" class="product-card" data-item-id="${escapeHtml(product.id)}" ${product.isSoldOut ? 'disabled' : ''}>
      <div class="product-image-wrap">
        ${imageBlock}
        ${product.isSoldOut ? '<span class="badge">Sold out</span>' : offerBadge}
      </div>
      <div class="product-body">
        <h2 class="product-title">${escapeHtml(product.title)}</h2>
        <div class="price-row">
          ${formatEnergyPriceHtml(product.energyPrice)}
        </div>
        <div class="price-crypto">${escapeHtml(cryptoLabel)}</div>
      </div>
    </button>
  `
}

function gearCardHtml(gear) {
  const stats = []
  if (gear.supplyNote) stats.push(gear.supplyNote)
  if (gear.dailyCap && gear.dailyCap !== '—') stats.push(`Daily cap: ${gear.dailyCap}`)
  if (gear.multiplier && gear.multiplier !== '—') stats.push(`${gear.multiplier}`)
  if (gear.repairDiscount && gear.repairDiscount !== '—' && stats.length < 2) {
    stats.push(`Repair: ${gear.repairDiscount}`)
  }

  return `
    <button type="button" class="product-card gear-card" data-gear-id="${escapeHtml(gear.id)}">
      <div class="product-image-wrap">
        ${gearImageBlock(gear)}
      </div>
      <div class="product-body">
        <div class="gear-badge-row">
          ${gear.chain ? `<span class="gear-badge chain">${escapeHtml(gear.chain)}</span>` : ''}
          ${gear.gearType ? `<span class="gear-badge">${escapeHtml(gear.gearType)}</span>` : ''}
          ${gear.rarity ? `<span class="gear-badge">${escapeHtml(gear.rarity)}</span>` : ''}
        </div>
        <h2 class="product-title">${escapeHtml(gear.title)}</h2>
        ${stats.length ? `<div class="gear-stat">${escapeHtml(stats.join(' · '))}</div>` : ''}
        <div class="gear-stat">View in Move+ app</div>
      </div>
    </button>
  `
}

function renderCatalog(main) {
  forceRealCatalogIfGearHidden()
  const toggle = marketplaceToggleHtml()

  if (isDigitalGearEnabled() && state.catalogTab === 'gear') {
    const items = filteredGearItems()
    const categories = getGearCategories()
    const chips = categories
      .map(
        (cat) =>
          `<button type="button" class="chip ${state.selectedCategory === cat ? 'active' : ''}" data-category="${escapeHtml(cat)}">${escapeHtml(cat)}</button>`,
      )
      .join('')

    const gearEmptyMessage =
      state.selectedCategory === 'Cycling'
        ? 'Cycling gear is coming soon.'
        : 'No digital gear in this category.'

    main.innerHTML = `
      ${toggle}
      <section class="card">
        <div class="alert alert-info">Digital gear is preview-only for now. Purchases and management happen inside Move+.</div>
        <p class="detail-desc" style="margin-top:8px">MiniPay checkout currently applies to Real Items only.</p>
      </section>
      <div class="chips" role="tablist">${chips}</div>
      ${
        items.length === 0
          ? `<section class="card empty"><p>${escapeHtml(gearEmptyMessage)}</p></section>`
          : `<div class="grid" id="gear-grid">${items.map(gearCardHtml).join('')}</div>`
      }
      ${diagnosticsHtml()}
    `

    bindCatalogTabHandlers(main)
    bindCategoryChipHandlers(main)
    bindGearImageFallbacks(main)
    main.querySelectorAll('[data-gear-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-gear-id')
        const gear = state.gearItems.find((g) => g.id === id)
        if (gear) setView('detail', { item: gear })
      })
    })
    return
  }

  if (state.loading) {
    main.innerHTML = `
      ${toggle}
      <section class="card loading"><div class="spinner"></div><p>Loading marketplace…</p></section>
    `
    bindCatalogTabHandlers(main)
    return
  }

  if (state.error) {
    main.innerHTML = `
      ${toggle}
      <section class="card error">
        <p>${escapeHtml(state.error)}</p>
        <button type="button" class="btn btn-secondary" id="retry-catalog" style="margin-top:12px">Retry</button>
      </section>
      ${diagnosticsHtml()}
    `
    bindCatalogTabHandlers(main)
    document.getElementById('retry-catalog')?.addEventListener('click', loadCatalog)
    return
  }

  const items = filteredItems()
  const emptyMessage =
    state.items.length === 0
      ? 'No products available right now.'
      : 'No products in this category.'
  const chips = CATEGORIES.map(
    (cat) =>
      `<button type="button" class="chip ${state.selectedCategory === cat ? 'active' : ''}" data-category="${escapeHtml(cat)}">${escapeHtml(cat)}</button>`,
  ).join('')

  main.innerHTML = `
    ${toggle}
    <div class="chips" role="tablist">${chips}</div>
    ${
      items.length === 0
        ? `<section class="card empty"><p>${emptyMessage}</p></section>`
        : `<div class="grid" id="product-grid">${items.map(productCardHtml).join('')}</div>`
    }
    ${diagnosticsHtml()}
  `

  bindCatalogTabHandlers(main)
  bindCategoryChipHandlers(main)

  main.querySelectorAll('[data-item-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-item-id')
      const product = state.items.find((i) => i.id === id)
      if (product && !product.isSoldOut) setView('detail', { item: product })
    })
  })
}

function renderGearDetail(main) {
  const gear = state.selectedItem
  if (!gear || !isDigitalGear(gear)) {
    setView('catalog')
    return
  }

  const appUrl = cfg().moveplusAppDeepLink || cfg().moveplusHomeUrl || 'https://amayatoken.online/moveplus/'

  main.innerHTML = `
    <button type="button" class="btn btn-ghost" id="back-catalog">← Back to catalog</button>
    <div class="detail-hero">
      ${gearImageBlock(gear, { detail: true })}
    </div>
    <section class="card">
      <div class="gear-badge-row" style="margin-bottom:10px">
        ${gear.chain ? `<span class="gear-badge chain">${escapeHtml(gear.chain)}</span>` : ''}
        ${gear.gearType ? `<span class="gear-badge">${escapeHtml(gear.gearType)}</span>` : ''}
        ${gear.rarity ? `<span class="gear-badge">${escapeHtml(gear.rarity)}</span>` : ''}
      </div>
      <h2 class="detail-title">${escapeHtml(gear.title)}</h2>
      <p class="detail-desc">${escapeHtml(gear.description || 'Digital gear preview.')}</p>
      <div class="meta-row"><span class="meta-label">Chain</span><span class="meta-value">${escapeHtml(gear.chain || '—')}</span></div>
      <div class="meta-row"><span class="meta-label">Gear type</span><span class="meta-value">${escapeHtml(gear.gearType || '—')}</span></div>
      <div class="meta-row"><span class="meta-label">Rarity</span><span class="meta-value">${escapeHtml(gear.rarity || '—')}</span></div>
      <div class="meta-row"><span class="meta-label">Daily cap</span><span class="meta-value">${escapeHtml(gear.dailyCap || '—')}</span></div>
      <div class="meta-row"><span class="meta-label">Multiplier</span><span class="meta-value">${escapeHtml(gear.multiplier || '—')}</span></div>
      <div class="meta-row"><span class="meta-label">Repair</span><span class="meta-value">${escapeHtml(gear.repairDiscount || '—')}</span></div>
      ${
        gear.supplyNote
          ? `<div class="meta-row"><span class="meta-label">Supply</span><span class="meta-value">${escapeHtml(gear.supplyNote)}</span></div>`
          : ''
      }
    </section>
    <section class="card">
      <div class="alert alert-info">Digital gear is preview-only for now. Purchases and management happen inside Move+.</div>
      <p class="detail-desc" style="margin-top:8px">MiniPay checkout currently applies to Real Items only.</p>
    </section>
    ${diagnosticsHtml()}
    <div class="action-bar" id="gear-detail-actions">
      <button type="button" class="btn btn-primary" id="open-moveplus-app">Open Move+ App</button>
      <button type="button" class="btn btn-secondary" id="view-gear-back">Back to Gear</button>
    </div>
  `

  bindGearImageFallbacks(main)
  document.getElementById('back-catalog')?.addEventListener('click', () => setView('catalog'))
  document.getElementById('view-gear-back')?.addEventListener('click', () => setView('catalog'))
  document.getElementById('open-moveplus-app')?.addEventListener('click', () => {
    openExternalUrl(appUrl)
  })
}

function renderDetail(main) {
  forceRealCatalogIfGearHidden()
  const product = state.selectedItem
  if (!product) {
    setView('catalog')
    return
  }

  if (isDigitalGear(product)) {
    renderGearDetail(main)
    return
  }

  const img = product.imageUrl
  const images = product.images?.length ? product.images : img ? [img] : []
  const soldOut = product.isSoldOut
  const offerExpired = product.offerExpired || isOfferExpiredProduct(product)
  const offerNote =
    product.isLimitedOffer && !offerExpired && product.offerCountdown
      ? `<div class="meta-row"><span class="meta-label">Offer</span><span class="meta-value">${escapeHtml(offerBadgeLabel(product))} · ${escapeHtml(product.offerCountdown)}</span></div>`
      : ''
  const manualOrderNote =
    product.category === 'Vouchers'
      ? 'This item may be fulfilled manually after order review.'
      : 'Physical orders are reviewed before fulfillment.'

  main.innerHTML = `
    <button type="button" class="btn btn-ghost" id="back-catalog">← Back to catalog</button>
    <div class="detail-hero">
      ${
        images.length > 0
          ? `<img src="${escapeHtml(images[0])}" alt="" />`
          : `<div class="product-image placeholder" style="height:100%">No image</div>`
      }
    </div>
    <section class="card">
      <h2 class="detail-title">${escapeHtml(product.title)}</h2>
      <p class="detail-desc">${escapeHtml(product.description || 'No description provided.')}</p>
      <div class="meta-row"><span class="meta-label">Category</span><span class="meta-value">${escapeHtml(product.category || '—')}</span></div>
      <div class="meta-row"><span class="meta-label">Energy price</span><span class="meta-value">${formatEnergyPriceHtml(product.energyPrice)}</span></div>
      <div class="meta-row"><span class="meta-label">Crypto price</span><span class="meta-value">${escapeHtml(formatProductCryptoLabel(product) || '—')} · ${escapeHtml(cfg().chainName || 'Celo')}</span></div>
      <div class="meta-row"><span class="meta-label">Delivery</span><span class="meta-value">Philippines only</span></div>
      <div class="meta-row"><span class="meta-label">Stock</span><span class="meta-value">${escapeHtml(stockDisplayLabel(product))}</span></div>
    </section>
    <section class="card">
      <div class="alert alert-info">${escapeHtml(manualOrderNote)}</div>
      ${soldOut ? `<div class="alert alert-warn">This product is currently unavailable.</div>` : ''}
      ${offerExpired ? `<div class="alert alert-warn">This offer has expired.</div>` : ''}
      ${offerNote}
    </section>
    ${diagnosticsHtml()}
    <div class="action-bar" id="detail-actions">
      <button type="button" class="btn btn-secondary ${soldOut || offerExpired ? 'btn-disabled' : ''}" id="add-to-cart-btn" ${soldOut || offerExpired ? 'disabled' : ''}>Add to Cart</button>
      <button type="button" class="btn btn-primary ${soldOut || offerExpired ? 'btn-disabled' : ''}" id="buy-now-btn" ${soldOut || offerExpired ? 'disabled' : ''}>Buy Now</button>
    </div>
  `

  document.getElementById('back-catalog')?.addEventListener('click', () => setView('catalog'))
  document.getElementById('add-to-cart-btn')?.addEventListener('click', () => {
    if (addToCart(product, 1)) render()
  })
  document.getElementById('buy-now-btn')?.addEventListener('click', async () => {
    if (!addToCart(product, 1)) return
    await ensureCatalogFreshForCheckout()
    setView('checkout')
  })
}

function renderCart(main) {
  const totals = getCartTotals()
  const lines = totals.lines

  if (lines.length === 0) {
    main.innerHTML = `
      <section class="card empty">
        <h2 class="detail-title" style="font-size:17px">Your cart is empty.</h2>
        <p class="detail-desc">Browse real items and add products to your cart.</p>
        <button type="button" class="btn btn-primary" id="browse-products" style="margin-top:12px">Browse products</button>
      </section>
      ${diagnosticsHtml()}
    `
    document.getElementById('browse-products')?.addEventListener('click', () => {
      state.catalogTab = 'real'
      setView('catalog')
    })
    return
  }

  const lineHtml = lines
    .map((line) => {
      const p = line.product
      const maxQty = getMaxCartQuantity(p)
      const thumb = p.imageUrl
        ? `<img class="cart-thumb" src="${escapeHtml(p.imageUrl)}" alt="" />`
        : `<div class="cart-thumb placeholder">—</div>`
      return `
        <article class="cart-line" data-cart-line="${escapeHtml(line.productId)}">
          ${thumb}
          <div class="cart-line-body">
            <h3 class="cart-line-title">${escapeHtml(p.title)}</h3>
            <div class="cart-line-price">${formatEnergyPriceHtml(p.energyPrice)}</div>
            <div class="cart-line-crypto">${escapeHtml(formatProductCryptoLabel(p) || '—')} each</div>
            ${
              p.isSoldOut || p.offerExpired || isOfferExpiredProduct(p)
                ? `<div class="cart-line-warn">${p.offerExpired || isOfferExpiredProduct(p) ? 'This offer has expired.' : 'Unavailable — remove to continue'}</div>`
                : `<div class="qty-row">
                    <button type="button" class="qty-btn" data-qty-dec="${escapeHtml(line.productId)}" aria-label="Decrease quantity">−</button>
                    <input type="number" class="qty-input" min="1" max="${maxQty}" value="${line.quantity}" data-qty-input="${escapeHtml(line.productId)}" inputmode="numeric" />
                    <button type="button" class="qty-btn" data-qty-inc="${escapeHtml(line.productId)}" aria-label="Increase quantity">+</button>
                  </div>`
            }
            <button type="button" class="cart-remove" data-cart-remove="${escapeHtml(line.productId)}">Remove</button>
          </div>
        </article>
      `
    })
    .join('')

  main.innerHTML = `
    <button type="button" class="btn btn-ghost" id="back-catalog">← Continue shopping</button>
    <section class="card">
      <h2 class="detail-title" style="font-size:17px">Cart (${totals.totalQuantity})</h2>
      <div class="cart-lines">${lineHtml}</div>
    </section>
    <section class="card">
      <div class="meta-row"><span class="meta-label">Energy subtotal</span><span class="meta-value">${formatEnergyPriceHtml(totals.totalEnergy)}</span></div>
      <div class="meta-row"><span class="meta-label">Crypto subtotal</span><span class="meta-value">${escapeHtml(totals.cryptoSubtotal)}</span></div>
      <div class="meta-row"><span class="meta-label">Delivery</span><span class="meta-value">Philippines only</span></div>
      <p class="detail-desc" style="margin-top:8px">Display totals are estimates. Payment amount is calculated by the server at checkout.</p>
    </section>
    ${cartHasUnavailableItems() ? `<section class="card"><div class="alert alert-warn">Remove expired or unavailable items before checkout.</div></section>` : ''}
    ${diagnosticsHtml()}
    <div class="action-bar">
      <button type="button" class="btn btn-secondary" id="continue-shopping">Continue Shopping</button>
      <button type="button" class="btn btn-primary ${cartHasUnavailableItems() ? 'btn-disabled' : ''}" id="cart-checkout-btn" ${cartHasUnavailableItems() ? 'disabled' : ''}>Checkout</button>
    </div>
  `

  document.getElementById('back-catalog')?.addEventListener('click', () => setView('catalog'))
  document.getElementById('continue-shopping')?.addEventListener('click', () => setView('catalog'))
  document.getElementById('cart-checkout-btn')?.addEventListener('click', async () => {
    await ensureCatalogFreshForCheckout()
    if (getCartLines().length === 0 || cartHasUnavailableItems()) {
      render()
      return
    }
    setView('checkout')
  })

  main.querySelectorAll('[data-qty-dec]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-qty-dec')
      const line = state.cart.find((l) => l.productId === id)
      if (!line) return
      if (line.quantity <= 1) {
        removeFromCart(id)
      } else {
        setCartLineQuantity(id, line.quantity - 1)
        showToast('Quantity updated', null, null)
      }
      renderCart(main)
    })
  })
  main.querySelectorAll('[data-qty-inc]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-qty-inc')
      const line = state.cart.find((l) => l.productId === id)
      if (!line) return
      setCartLineQuantity(id, line.quantity + 1)
      showToast('Quantity updated', null, null)
      renderCart(main)
    })
  })
  main.querySelectorAll('[data-qty-input]').forEach((input) => {
    input.addEventListener('change', () => {
      const id = input.getAttribute('data-qty-input')
      setCartLineQuantity(id, input.value)
      showToast('Quantity updated', null, null)
      renderCart(main)
    })
  })
  main.querySelectorAll('[data-cart-remove]').forEach((btn) => {
    btn.addEventListener('click', () => {
      removeFromCart(btn.getAttribute('data-cart-remove'))
      renderCart(main)
    })
  })
}

function renderCheckoutSummaryHtml(totals) {
  return totals.lines
    .map(
      (line) => `
      <div class="checkout-line">
        <span>${escapeHtml(line.product.title)} × ${line.quantity}</span>
        <span>${formatEnergyPriceHtml(line.product.energyPrice * line.quantity)}</span>
      </div>
    `,
    )
    .join('')
}

function renderCheckoutForm(main) {
  const totals = getCartTotals()
  if (totals.lines.length === 0) {
    setView('cart')
    return
  }
  if (cartHasUnavailableItems()) {
    setView('cart')
    return
  }

  const minipayEnabled = cfg().enableMiniPayCheckout !== false
  const inMiniPay = isMiniPayWallet()
  const missingPrice = cartHasMissingCryptoPrice() || !totals.hasCryptoPrices
  const selectedToken = getSelectedPaymentToken()
  const minipayReady = minipayEnabled && inMiniPay && !missingPrice
  const minipayBlockedReason = missingPrice
    ? 'Set a USD crypto price in Admin Dashboard before MiniPay checkout.'
    : null
  const payLabel = `Pay with ${selectedToken.symbol}`
  const accountSummary = getLinkedAccountSummary()
  const energyRequired = totals.totalEnergy
  const energyInsufficient =
    accountSummary.linked &&
    accountSummary.energyBalance != null &&
    accountSummary.energyBalance < energyRequired
  const energyBalanceRow = accountSummary.linked
    ? `<div class="meta-row"><span class="meta-label">Your Energy</span><span class="meta-value">${formatEnergyPriceHtml(
        accountSummary.energyBalance != null ? accountSummary.energyBalance : 0,
      )}${accountSummary.energyBalance == null ? ' <span class="muted-inline">(syncing)</span>' : ''}</span></div>`
    : ''
  const energyWarnHtml = energyInsufficient
    ? `<div class="alert alert-warn">Insufficient Energy balance. MiniPay stablecoin checkout is still available.</div>`
    : ''

  const tokenSelectorHtml = inMiniPay && minipayEnabled && !missingPrice
    ? `
      <div class="token-selector" role="radiogroup" aria-label="Pay with stablecoin">
        <div class="token-selector-label">Pay with</div>
        <div class="token-selector-options">
          ${MINIPAY_TOKEN_PRIORITY.map((symbol) => {
            const active = selectedToken.symbol === symbol
            return `<button type="button" class="token-chip ${active ? 'active' : ''}" data-payment-token="${symbol}" role="radio" aria-checked="${active}">${symbol}</button>`
          }).join('')}
        </div>
        <p class="token-selector-hint">Same USD price. MiniPay accepts USDT, USDC, and cUSD on Celo.</p>
      </div>
    `
    : ''

  main.innerHTML = `
    <button type="button" class="btn btn-ghost" id="back-cart">← Back to cart</button>
    <section class="card">
      <h2 class="detail-title" style="font-size:17px">Checkout</h2>
      <div class="checkout-summary">${renderCheckoutSummaryHtml(totals)}</div>
      <div class="meta-row"><span class="meta-label">Total Energy</span><span class="meta-value">${formatEnergyPriceHtml(totals.totalEnergy)}</span></div>
      ${energyBalanceRow}
      <div class="meta-row"><span class="meta-label">Stablecoin total</span><span class="meta-value">${escapeHtml(totals.cryptoSubtotal)}</span></div>
      <div class="meta-row"><span class="meta-label">Delivery</span><span class="meta-value">Philippines only</span></div>
      ${tokenSelectorHtml}
    </section>
    <section class="card" id="checkout-form-card">
      <h3 style="margin:0 0 12px;font-size:15px">Delivery details</h3>
      <form id="checkout-form">
        <div class="form-group"><label for="customer_name">Full name</label><input id="customer_name" name="customer_name" required autocomplete="name" /></div>
        <div class="form-group"><label for="phone_number">Phone</label><input id="phone_number" name="phone_number" required autocomplete="tel" /></div>
        <div class="form-group"><label for="email">Email</label><input id="email" name="email" type="email" required autocomplete="email" /></div>
        <div class="form-group"><label for="delivery_address">Delivery address (Philippines)</label><textarea id="delivery_address" name="delivery_address" required></textarea></div>
        <div class="form-group"><label for="comments">Comments (optional)</label><textarea id="comments" name="comments"></textarea></div>
      </form>
      <div id="checkout-status"></div>
    </section>
    <section class="card">
      <div class="alert alert-info">Energy redemption on web uses your linked Move+ account. MiniPay crypto checkout works without linking.</div>
      ${energyWarnHtml}
      ${
        minipayBlockedReason
          ? `<div class="alert alert-warn">${escapeHtml(minipayBlockedReason)}</div>`
          : ''
      }
      ${
        !inMiniPay
          ? `<div class="alert alert-warn">Wallet signing is unavailable in a normal browser. Open inside MiniPay to pay with crypto.</div>`
          : minipayEnabled
            ? `<div class="alert alert-info">MiniPay detected. Choose USDT, USDC, or cUSD to pay.</div>`
            : `<div class="alert alert-warn">MiniPay checkout is coming soon.</div>`
      }
    </section>
    ${diagnosticsHtml()}
    <div class="action-bar" id="checkout-actions">
      <button type="button" class="btn btn-energy" id="energy-info-btn">Pay with ENERGY</button>
      <button type="button" class="btn btn-primary ${!minipayReady ? 'btn-disabled' : ''}" id="minipay-checkout-btn" ${!minipayReady ? 'disabled' : ''}>
        ${minipayReady ? payLabel : 'Open inside MiniPay to pay'}
      </button>
    </div>
  `

  document.getElementById('back-cart')?.addEventListener('click', () => setView('cart'))
  document.getElementById('energy-info-btn')?.addEventListener('click', () => {
    handleEnergyPayClick(energyRequired)
  })
  document.getElementById('minipay-checkout-btn')?.addEventListener('click', () => startMinipayCheckout())
  main.querySelectorAll('[data-payment-token]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const symbol = btn.getAttribute('data-payment-token')
      if (!resolvePaymentToken(symbol)) return
      state.selectedPaymentToken = symbol
      render()
    })
  })

  // Refresh live prices in background; pick default token by balance once.
  ensureCatalogFreshForCheckout().then(async () => {
    if (state.view !== 'checkout') return
    const refreshed = getCartTotals()
    const priceChanged = refreshed.cryptoSubtotal !== totals.cryptoSubtotal
    if (priceChanged || cartHasUnavailableItems()) {
      render()
      return
    }
    if (inMiniPay && !state._tokenDefaultPicked) {
      state._tokenDefaultPicked = true
      const wallet = state.minipayWalletAddress || (await prepareMiniPayWallet())
      const preferred = await pickDefaultPaymentToken(wallet)
      if (preferred && preferred !== state.selectedPaymentToken) {
        state.selectedPaymentToken = preferred
        render()
      }
    }
  })
}

async function startMinipayCheckout() {
  const selectedToken = getSelectedPaymentToken()
  const payBtn = document.getElementById('minipay-checkout-btn')
  const fail = (message, step = 'create-session-failed') => {
    setPaymentDebug({ step, lastError: message })
    showCheckoutStatus(`<div class="alert alert-error">${escapeHtml(message)}</div>`)
    showToast(message, null, null)
    if (payBtn) {
      payBtn.disabled = false
      payBtn.textContent = `Pay with ${selectedToken.symbol}`
    }
  }

  setPaymentDebug({
    step: 'preparing',
    lastError: null,
    providerDetected: Boolean(window.ethereum),
    isMiniPay: isMiniPayWallet(),
    selectedAccount: state.minipayWalletAddress,
    tokenAddress: selectedToken.address,
    createSessionStatus: null,
    verifyStatus: null,
    txHash: null,
  })

  if (state.catalogTab !== 'real') {
    fail('MiniPay checkout is only available for Real Items.', 'blocked-catalog-tab')
    return
  }
  if (!isMiniPayWallet()) {
    fail(
      'Wallet signing is unavailable in a normal browser. Open inside MiniPay to pay with crypto.',
      'blocked-not-minipay',
    )
    return
  }
  if (cfg().enableMiniPayCheckout === false) {
    fail('MiniPay checkout is disabled.', 'blocked-disabled')
    return
  }

  showCheckoutStatus(`<div class="alert alert-info">Preparing payment…</div>`)
  if (payBtn) {
    payBtn.disabled = true
    payBtn.textContent = 'Preparing…'
  }

  try {
    await ensureCatalogFreshForCheckout()
  } catch (err) {
    fail(`Could not refresh product prices: ${String(err.message ?? err)}`, 'catalog-refresh-failed')
    return
  }

  if (getCartLines().length === 0) {
    fail('Your cart is empty. Add a Real Item before paying.', 'blocked-empty-cart')
    return
  }
  if (cartHasUnavailableItems()) {
    fail('Remove expired or unavailable items before checkout.', 'blocked-unavailable')
    return
  }
  if (cartHasMissingCryptoPrice()) {
    fail('Cart items need a USD crypto price in Admin before MiniPay checkout.', 'blocked-missing-price')
    return
  }

  const form = document.getElementById('checkout-form')
  if (!form) {
    fail('Checkout form is missing. Reload and try again.', 'blocked-missing-form')
    return
  }
  if (!form.reportValidity()) {
    setPaymentDebug({ step: 'form-invalid', lastError: 'Delivery form incomplete' })
    if (payBtn) {
      payBtn.disabled = false
      payBtn.textContent = `Pay with ${selectedToken.symbol}`
    }
    return
  }

  const body = {
    items: buildCheckoutItemsPayload(),
    customer_name: form.customer_name.value.trim(),
    phone_number: form.phone_number.value.trim(),
    email: form.email.value.trim(),
    delivery_address: form.delivery_address.value.trim(),
    comments: form.comments.value.trim() || null,
    payment_token_symbol: selectedToken.symbol,
  }

  if (payBtn) payBtn.textContent = 'Creating checkout…'
  showCheckoutStatus(`<div class="alert alert-info">Creating checkout session…</div>`)
  setPaymentDebug({ step: 'create-session-started', lastError: null })

  try {
    const fn = cfg().createSessionFunction || 'minipay-checkout-create-session'
    logDebug('create-session request', { fn, items: body.items, payment_token_symbol: body.payment_token_symbol })
    const { status, data } = await invokeFunction(fn, body)
    setPaymentDebug({
      step: 'create-session-response',
      createSessionStatus: status,
      tokenAddress: data?.token_address ?? null,
      amountRaw: data?.amount_raw ?? null,
      treasuryAddress: data?.treasury_address ?? null,
      chainId: data?.chain_id ?? null,
    })
    logDebug('create-session response', {
      status,
      success: data?.success,
      amount_raw: data?.amount_raw,
      token_symbol: data?.token_symbol,
      token_decimals: data?.token_decimals,
    })

    if (!data?.success) {
      throw new Error(friendlyApiError(status, data))
    }

    const session = {
      sessionId: data.session_id,
      sessionToken: data.session_token,
      itemTitle: data.item_title || 'Order',
      amountDisplay: data.amount_display,
      tokenSymbol: data.token_symbol,
      tokenDecimals: data.token_decimals,
      chainName: data.chain_name || 'Celo',
      treasuryAddress: data.treasury_address,
      amountRaw: data.amount_raw,
      tokenAddress: data.token_address,
      chainId: data.chain_id,
      expiresAt: data.expires_at,
      cartItems: data.cart_items ?? null,
      totalQuantity: data.total_quantity ?? null,
    }

    if (!session.treasuryAddress || !session.tokenAddress || session.amountRaw == null) {
      throw new Error('Checkout session missing payment parameters. Please try again.')
    }

    logDebug('session payment params', {
      amountRaw: String(session.amountRaw),
      amountDisplay: session.amountDisplay,
      tokenAddress: session.tokenAddress,
      tokenSymbol: session.tokenSymbol,
      tokenDecimals: session.tokenDecimals,
      treasuryAddress: session.treasuryAddress,
      chainId: session.chainId,
    })

    setPaymentDebug({
      step: 'session-ready',
      lastError: null,
      tokenAddress: session.tokenAddress,
      amountRaw: String(session.amountRaw),
      treasuryAddress: session.treasuryAddress,
      chainId: session.chainId,
    })

    setView('payment', { session, autoPay: true })
  } catch (err) {
    fail(String(err.message ?? err), 'create-session-failed')
  }
}

function renderPayment(main) {
  const session = state.checkoutSession
  if (!session || state.catalogTab !== 'real') {
    setPaymentDebug({
      step: 'payment-view-blocked',
      lastError: !session ? 'Missing checkout session' : 'Not on Real Items tab',
    })
    showToast('Payment session missing. Please start checkout again.', null, null)
    setView('checkout')
    return
  }

  const inMiniPay = isMiniPayWallet()
  const tokenSymbol = session.tokenSymbol || getSelectedPaymentToken().symbol
  const payLabel = inMiniPay ? `Pay with ${tokenSymbol}` : 'Open inside MiniPay to pay'
  const autoPay = state.autoPayAfterSession
  state.autoPayAfterSession = false

  main.innerHTML = `
    <button type="button" class="btn btn-ghost" id="back-checkout">← Back to checkout</button>
    <section class="card">
      <h2 class="detail-title" style="font-size:17px">Payment</h2>
      <div class="meta-row"><span class="meta-label">Order</span><span class="meta-value">${escapeHtml(session.itemTitle || 'Items')}</span></div>
      <div class="meta-row"><span class="meta-label">Amount</span><span class="meta-value">${escapeHtml(session.amountDisplay || '—')}</span></div>
      <div class="meta-row"><span class="meta-label">Token</span><span class="meta-value">${escapeHtml(tokenSymbol)}</span></div>
      <div class="meta-row"><span class="meta-label">Network</span><span class="meta-value">${escapeHtml(session.chainName || 'Celo')}</span></div>
      <div class="meta-row"><span class="meta-label">Delivery</span><span class="meta-value">Philippines only</span></div>
      <div class="meta-row"><span class="meta-label">Status</span><span class="meta-value" id="checkout-live-status">pending</span></div>
    </section>
    ${
      !inMiniPay
        ? `<section class="card"><div class="alert alert-warn">Wallet signing is unavailable in a normal browser. Open inside MiniPay to pay with crypto.</div></section>`
        : `<section class="card"><div class="alert alert-info">MiniPay detected. Confirm ${escapeHtml(tokenSymbol)} payment below.</div><div class="meta-row" id="wallet-line" style="display:none"><span class="meta-label">Wallet</span><span class="meta-value" id="wallet-addr">—</span></div></section>`
    }
    <section class="card" id="payment-status-box">
      <div class="alert alert-info">Preparing payment…</div>
    </section>
    ${diagnosticsHtml()}
    <div class="action-bar">
      <button type="button" class="btn btn-primary ${inMiniPay ? '' : 'btn-disabled'}" id="confirm-pay-btn" ${inMiniPay ? '' : 'disabled'}>${payLabel}</button>
    </div>
  `

  document.getElementById('back-checkout')?.addEventListener('click', () => {
    state.autoPayAfterSession = false
    setView('checkout')
  })

  const payBtn = document.getElementById('confirm-pay-btn')
  if (!inMiniPay || !payBtn) {
    showPaymentStatus(
      `<div class="alert alert-warn">Wallet signing is unavailable in a normal browser. Open inside MiniPay to pay with crypto.</div>`,
    )
    return
  }

  prepareMiniPayWallet().then(() => syncMiniPayWalletDisplay())
  payBtn.addEventListener('click', () => confirmMinipayPayment(session))

  if (autoPay) {
    // Open MiniPay confirmation immediately after session create (single-tap UX).
    setTimeout(() => confirmMinipayPayment(session), 50)
  }
}

async function invokeVerify(body) {
  const fn = cfg().verifyFunction || 'minipay-checkout-verify-payment'
  return invokeFunction(fn, body)
}

async function confirmMinipayPayment(session) {
  if (state.paymentInFlight) {
    logDebug('confirmMinipayPayment ignored — already in flight')
    return
  }

  const payBtn = document.getElementById('confirm-pay-btn')
  const statusBox = document.getElementById('payment-status-box')
  const walletLine = document.getElementById('wallet-line')
  const walletAddrEl = document.getElementById('wallet-addr')
  const liveStatus = document.getElementById('checkout-live-status')

  const tokenSymbol = session.tokenSymbol || getSelectedPaymentToken().symbol
  const payLabel = `Pay with ${tokenSymbol}`

  const fail = (message, step) => {
    state.paymentInFlight = false
    setPaymentDebug({ step, lastError: message })
    if (liveStatus) liveStatus.textContent = 'failed'
    showPaymentStatus(`<div class="alert alert-error">${escapeHtml(message)}</div>`, { error: message })
    if (payBtn) {
      payBtn.disabled = false
      payBtn.textContent = payLabel
    }
  }

  if (!isMiniPayWallet()) {
    fail(
      'Wallet signing is unavailable in a normal browser. Open inside MiniPay to pay with crypto.',
      'blocked-not-minipay',
    )
    return
  }
  if (!payBtn || !statusBox) {
    fail('Payment UI is missing. Reload and try again.', 'blocked-missing-ui')
    return
  }
  if (!session?.treasuryAddress || !session?.tokenAddress || session?.amountRaw == null) {
    fail('Checkout session is incomplete. Start checkout again.', 'blocked-bad-session')
    return
  }

  state.paymentInFlight = true
  payBtn.disabled = true
  payBtn.textContent = 'Waiting…'
  if (liveStatus) liveStatus.textContent = 'preparing'
  showPaymentStatus(`<div class="alert alert-info">Preparing payment…</div>`)
  setPaymentDebug({
    step: 'preparing-payment',
    lastError: null,
    providerDetected: Boolean(window.ethereum),
    isMiniPay: true,
    tokenAddress: session.tokenAddress,
    amountRaw: String(session.amountRaw),
    treasuryAddress: session.treasuryAddress,
    chainId: session.chainId ?? null,
  })

  try {
    let payer = state.minipayWalletAddress
    if (!payer) payer = await prepareMiniPayWallet()
    if (!payer) {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
      payer = normalizeAddr(accounts?.[0])
    }
    if (!payer) throw new Error('No wallet address returned from MiniPay')

    state.minipayWalletAddress = payer
    setPaymentDebug({ selectedAccount: payer, step: 'account-ready' })
    if (walletLine) walletLine.style.display = 'flex'
    if (walletAddrEl) walletAddrEl.textContent = shortAddr(payer)

    let chainId = session.chainId
    try {
      const providerChainId = await window.ethereum.request({ method: 'eth_chainId' })
      setPaymentDebug({ chainId: providerChainId || chainId })
      logDebug('provider chainId', providerChainId)
    } catch (_) {
      /* optional */
    }

    showPaymentStatus(`<div class="alert alert-info">Checking ${escapeHtml(tokenSymbol)} balance…</div>`)
    if (liveStatus) liveStatus.textContent = 'checking balance'
    setPaymentDebug({ step: 'balanceOf-started', lastError: null })

    let walletBalanceRaw
    try {
      walletBalanceRaw = await fetchErc20BalanceRaw(session.tokenAddress, payer)
    } catch (balanceErr) {
      logDebug('balanceOf failed', balanceErr)
      setPaymentDebug({
        step: 'balanceOf-failed',
        lastError: String(balanceErr?.message ?? balanceErr),
      })
      fail(
        isDebugMode()
          ? `Could not read ${tokenSymbol} balance: ${String(balanceErr?.message ?? balanceErr)}`
          : `Could not verify your ${tokenSymbol} balance. Please try again.`,
        'balanceOf-failed',
      )
      return
    }

    const requiredRaw = BigInt(session.amountRaw)
    setPaymentDebug({
      step: 'balanceOf-result',
      walletBalanceRaw: walletBalanceRaw.toString(),
      amountRaw: requiredRaw.toString(),
    })
    logDebug('token balanceOf', {
      symbol: tokenSymbol,
      wallet: payer,
      balanceRaw: walletBalanceRaw.toString(),
      requiredRaw: requiredRaw.toString(),
    })

    if (walletBalanceRaw < requiredRaw) {
      fail(insufficientTokenMessage(tokenSymbol), 'insufficient-balance')
      return
    }

    showPaymentStatus(`<div class="alert alert-info">Waiting for MiniPay confirmation…</div>`)
    if (liveStatus) liveStatus.textContent = 'awaiting confirmation'
    payBtn.textContent = 'Confirm in MiniPay…'

    const dataHex = encodeErc20Transfer(session.treasuryAddress, session.amountRaw)
    const txParams = {
      from: payer,
      to: session.tokenAddress,
      data: dataHex,
      value: '0x0',
      chainId: chainIdHex(session.chainId),
    }
    logDebug('eth_sendTransaction params', {
      to: txParams.to,
      from: txParams.from,
      chainId: txParams.chainId,
      amountRaw: String(session.amountRaw),
      tokenSymbol,
      dataPrefix: dataHex.slice(0, 10),
    })
    setPaymentDebug({ step: 'eth_sendTransaction-started', lastError: null })

    const txHash = await window.ethereum.request({
      method: 'eth_sendTransaction',
      params: [txParams],
    })

    if (!txHash) throw new Error('MiniPay returned no transaction hash')

    setPaymentDebug({ step: 'eth_sendTransaction-result', txHash: String(txHash) })
    logDebug('eth_sendTransaction result', txHash)
    if (liveStatus) liveStatus.textContent = 'submitted'
    showPaymentStatus(
      `<div class="alert alert-info">Transaction submitted: ${escapeHtml(shortAddr(String(txHash)))}. Verifying payment…</div>`,
    )

    setPaymentDebug({ step: 'verify-payment-started' })
    let verifyStatus
    let verifyData
    try {
      const verified = await invokeVerify({
        session_id: session.sessionId,
        session_token: session.sessionToken,
        tx_hash: txHash,
        payer_wallet_address: payer,
      })
      verifyStatus = verified.status
      verifyData = verified.data
    } catch (verifyErr) {
      logDebug('verify-payment network error', verifyErr)
      setPaymentDebug({
        step: 'verify-payment-network-error',
        txHash: String(txHash),
        lastError: isDebugMode() ? String(verifyErr?.message ?? verifyErr) : VERIFY_PENDING_MESSAGE,
      })
      state.paymentInFlight = false
      showVerifyPendingRecovery(session, txHash, payer)
      return
    }

    setPaymentDebug({
      step: 'verify-payment-response',
      verifyStatus,
      txHash: verifyData?.tx_hash || String(txHash),
    })
    logDebug('verify-payment response', {
      status: verifyStatus,
      success: verifyData?.success,
      paid: verifyData?.status,
    })

    if (verifyStatus === 202 || verifyData?.status === 'submitted') {
      state.paymentInFlight = false
      showVerifyPendingRecovery(session, txHash, payer)
      return
    }

    if (!verifyData?.success || verifyData.status !== 'paid') {
      if (isVerifyPendingError(null, verifyStatus)) {
        state.paymentInFlight = false
        showVerifyPendingRecovery(session, txHash, payer)
        return
      }
      throw new Error(friendlyApiError(verifyStatus, verifyData))
    }

    setPaymentDebug({ step: 'payment-successful', lastError: null })
    if (liveStatus) liveStatus.textContent = 'paid'
    showPaymentStatus(`<div class="alert alert-info">Payment successful</div>`)
    state.paymentInFlight = false

    setView('paid', {
      session: {
        ...session,
        txHash: verifyData.tx_hash || String(txHash),
        explorerUrl: verifyData.explorer_url,
        receiptTxHash: verifyData.receipt_tx_hash ?? null,
        receiptExplorerUrl: verifyData.receipt_explorer_url ?? null,
        receiptPending: verifyData.receipt_pending === true,
        receiptRecorded: verifyData.receipt_recorded === true || Boolean(verifyData.receipt_tx_hash),
      },
    })
    clearCart()
  } catch (err) {
    const raw = String(err?.message ?? err ?? 'Payment failed')
    logDebug('payment error raw', err)
    if (isDebugMode()) {
      setPaymentDebug({ lastError: raw })
    }
    if (isUserCancelledWalletError(err)) {
      fail('Payment cancelled', 'payment-cancelled')
      return
    }
    if (isInsufficientBalanceError(err)) {
      fail(insufficientTokenMessage(tokenSymbol), 'insufficient-balance')
      return
    }
    // If we already have a submitted tx in debug/state, prefer recovery UI.
    const submittedTx = state.paymentDebug?.txHash || state.checkoutSession?.txHash
    if (submittedTx && isVerifyPendingError(err)) {
      state.paymentInFlight = false
      showVerifyPendingRecovery(session, submittedTx, state.minipayWalletAddress)
      return
    }
    fail(friendlyPaymentError(err, tokenSymbol), 'payment-failed')
  }
}

function renderPaid(main) {
  const session = state.checkoutSession
  const receiptPending = session?.receiptPending === true
  const hasReceipt = Boolean(session?.receiptTxHash)

  main.innerHTML = `
    <section class="card">
      <h2 class="detail-title" style="font-size:17px;color:var(--accent)">Payment verified</h2>
      ${
        hasReceipt
          ? `<p class="detail-desc">Receipt recorded on Celo. Your order is pending fulfillment.</p>`
          : receiptPending
            ? `<p class="detail-desc">Payment verified. On-chain receipt is pending — your order is confirmed and awaiting fulfillment.</p>`
            : `<p class="detail-desc">Your order is pending fulfillment. Thank you for shopping with Move+.</p>`
      }
      <div class="meta-row"><span class="meta-label">Product</span><span class="meta-value">${escapeHtml(session?.itemTitle || '—')}</span></div>
      <div class="meta-row"><span class="meta-label">Amount</span><span class="meta-value">${escapeHtml(session?.amountDisplay || '—')} ${escapeHtml(session?.tokenSymbol || '')}</span></div>
      ${
        session?.txHash
          ? `<div class="meta-row"><span class="meta-label">Payment tx</span><span class="meta-value">${session.explorerUrl ? `<a class="tx-link" href="${escapeHtml(session.explorerUrl)}" target="_blank" rel="noopener">${shortAddr(session.txHash)}</a>` : shortAddr(session.txHash)}</span></div>`
          : ''
      }
      ${
        hasReceipt
          ? `<div class="meta-row"><span class="meta-label">Receipt tx</span><span class="meta-value">${session.receiptExplorerUrl ? `<a class="tx-link" href="${escapeHtml(session.receiptExplorerUrl)}" target="_blank" rel="noopener">${shortAddr(session.receiptTxHash)}</a>` : shortAddr(session.receiptTxHash)}</span></div>`
          : ''
      }
      ${
        receiptPending && !hasReceipt
          ? `<div class="alert alert-info" style="margin-top:12px">On-chain receipt may be recorded later by Move+. No action needed from you.</div>`
          : ''
      }
    </section>
    <button type="button" class="btn btn-primary" id="back-shop">Back to catalog</button>
    ${diagnosticsHtml()}
  `
  document.getElementById('back-shop')?.addEventListener('click', () => {
    state.checkoutSession = null
    state.selectedItem = null
    clearCart()
    setView('catalog')
  })
}

function providerStatusLabel() {
  if (isMiniPayWallet()) return 'MiniPay provider detected'
  if (!window.ethereum) return 'Ethereum provider missing'
  return 'Ethereum provider exists but is not MiniPay'
}

function diagnosticsHtml() {
  if (!isDebugMode()) return ''
  const meta = state.catalogMeta
  const pd = state.paymentDebug || {}
  return `
    <section class="card diagnostics-card">
      <strong>Diagnostics</strong>
      <div class="diagnostics-row"><span>catalog source</span><span class="diagnostics-value">${escapeHtml(meta?.source || '—')}</span></div>
      <div class="diagnostics-row"><span>catalog tab</span><span class="diagnostics-value">${escapeHtml(state.catalogTab)}</span></div>
      <div class="diagnostics-row"><span>gear preview count</span><span class="diagnostics-value">${state.gearItems.length}</span></div>
      <div class="diagnostics-row"><span>gear source</span><span class="diagnostics-value">digital-gear-preview.js (display only)</span></div>
      <div class="diagnostics-row"><span>stock field</span><span class="diagnostics-value">${escapeHtml(String(meta?.stockField ?? 'stock_quantity'))}</span></div>
      <div class="diagnostics-row"><span>availability field</span><span class="diagnostics-value">${escapeHtml(String(meta?.availabilityField ?? 'is_available'))}</span></div>
      <div class="diagnostics-row"><span>rows returned</span><span class="diagnostics-value">${meta?.rowCount ?? '—'}</span></div>
      <div class="diagnostics-row"><span>first row stock_quantity</span><span class="diagnostics-value">${escapeHtml(String(meta?.firstRowStock ?? '—'))}</span></div>
      <div class="diagnostics-row"><span>first row is_available</span><span class="diagnostics-value">${escapeHtml(String(meta?.firstRowAvailable ?? '—'))}</span></div>
      <div class="diagnostics-row"><span>first product isSoldOut</span><span class="diagnostics-value">${escapeHtml(String(meta?.firstProductIsSoldOut ?? '—'))}</span></div>
      <div class="diagnostics-row"><span>demo mode</span><span class="diagnostics-value">${meta?.demoMode ? 'on' : 'off'}</span></div>
      <div class="diagnostics-row"><span>checkout path</span><span class="diagnostics-value">${escapeHtml(`${window.location.origin}${window.location.pathname}`)}</span></div>
      <div class="diagnostics-row"><span>provider status</span><span class="diagnostics-value">${providerStatusLabel()}</span></div>
      <div class="diagnostics-row"><span>has window.ethereum</span><span class="diagnostics-value">${window.ethereum ? 'yes' : 'no'}</span></div>
      <div class="diagnostics-row"><span>isMiniPay</span><span class="diagnostics-value">${state.isMiniPay ? 'yes' : 'no'}</span></div>
      <div class="diagnostics-row"><span>cart items</span><span class="diagnostics-value">${getCartItemCount()}</span></div>
      <div class="diagnostics-row"><span>view</span><span class="diagnostics-value">${escapeHtml(state.view)}</span></div>
      <div class="diagnostics-row"><span>token</span><span class="diagnostics-value">${state.checkoutSession?.sessionToken ? 'present' : 'missing'}</span></div>
      <div class="diagnostics-row"><span>payment step</span><span class="diagnostics-value" id="payment-debug-step">${escapeHtml(pd.step || 'idle')}</span></div>
      <div class="diagnostics-row"><span>last payment error</span><span class="diagnostics-value" id="payment-debug-error">${escapeHtml(pd.lastError || '—')}</span></div>
      <div class="diagnostics-row"><span>selected account</span><span class="diagnostics-value">${escapeHtml(pd.selectedAccount ? shortAddr(pd.selectedAccount) : '—')}</span></div>
      <div class="diagnostics-row"><span>chainId</span><span class="diagnostics-value">${escapeHtml(String(pd.chainId ?? '—'))}</span></div>
      <div class="diagnostics-row"><span>token address</span><span class="diagnostics-value">${escapeHtml(pd.tokenAddress ? shortAddr(pd.tokenAddress) : '—')}</span></div>
      <div class="diagnostics-row"><span>amount raw</span><span class="diagnostics-value">${escapeHtml(pd.amountRaw != null ? String(pd.amountRaw) : '—')}</span></div>
      <div class="diagnostics-row"><span>wallet balance raw</span><span class="diagnostics-value">${escapeHtml(pd.walletBalanceRaw != null ? String(pd.walletBalanceRaw) : '—')}</span></div>
      <div class="diagnostics-row"><span>treasury</span><span class="diagnostics-value">${escapeHtml(pd.treasuryAddress ? shortAddr(pd.treasuryAddress) : '—')}</span></div>
      <div class="diagnostics-row"><span>tx hash</span><span class="diagnostics-value">${escapeHtml(pd.txHash ? shortAddr(pd.txHash) : '—')}</span></div>
      <div class="diagnostics-row"><span>create-session HTTP</span><span class="diagnostics-value">${escapeHtml(String(pd.createSessionStatus ?? '—'))}</span></div>
      <div class="diagnostics-row"><span>verify-payment HTTP</span><span class="diagnostics-value">${escapeHtml(String(pd.verifyStatus ?? '—'))}</span></div>
    </section>
  `
}

function render() {
  const main = document.getElementById('main')
  if (!main) return

  if (state.view === 'catalog') renderCatalog(main)
  else if (state.view === 'detail') renderDetail(main)
  else if (state.view === 'cart') renderCart(main)
  else if (state.view === 'checkout') renderCheckoutForm(main)
  else if (state.view === 'payment') renderPayment(main)
  else if (state.view === 'paid') renderPaid(main)
  syncCartBadge()
}

function boot() {
  initHeaderUi()
  loadCartFromStorage()
  syncCartBadge()
  syncWalletDetection()
  if (isDigitalGearEnabled()) {
    loadGearPreview()
  } else {
    state.gearItems = []
    state.catalogTab = 'real'
    state.selectedCategory = 'All'
  }
  syncSearchPlaceholder()
  loadCatalog()

  // Account link: consume ?link_token= then refresh summary from web session.
  void consumeLinkTokenFromUrl().then(() => refreshLinkedAccountSummary({ silent: true }))

  if (window.ethereum && typeof window.ethereum.on === 'function') {
    window.ethereum.on('accountsChanged', syncWalletDetection)
    window.ethereum.on('chainChanged', syncWalletDetection)
  }
}

/* ——— Header UI (catalog chrome only) ——— */

function cfgUrl(key, fallback) {
  const v = cfg()[key]
  return typeof v === 'string' && v.trim() ? v.trim().replace(/\/+$/, '') : fallback
}

function legalPageUrl(page) {
  const key = `${page}Url`
  const defaults = {
    terms: 'terms',
    privacy: 'privacy',
    refund: 'refund',
  }
  return cfgUrl(key, defaults[page] || page)
}

function openLegalPage(page) {
  window.location.href = legalPageUrl(page)
}

function openExternalUrl(url) {
  window.open(url, '_blank', 'noopener,noreferrer')
}

function setOverlayVisible(visible) {
  const overlay = document.getElementById('ui-overlay')
  if (!overlay) return
  overlay.classList.toggle('hidden', !visible)
  overlay.setAttribute('aria-hidden', visible ? 'false' : 'true')
}

function parseBoolean(value) {
  if (value === true || value === 'true' || value === 1 || value === '1') return true
  if (value === false || value === 'false' || value === 0 || value === '0') return false
  return null
}

function getStoredWebSession() {
  try {
    const raw = localStorage.getItem(WEB_SESSION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const token = typeof parsed.session_token === 'string' ? parsed.session_token.trim() : ''
    if (!token) return null
    if (parsed.expires_at && new Date(parsed.expires_at).getTime() <= Date.now()) {
      clearLinkedAccountLocal()
      return null
    }
    return {
      session_token: token,
      expires_at: parsed.expires_at || null,
    }
  } catch (_) {
    return null
  }
}

function persistWebSession(sessionToken, expiresAt) {
  try {
    localStorage.setItem(
      WEB_SESSION_STORAGE_KEY,
      JSON.stringify({
        session_token: sessionToken,
        expires_at: expiresAt || null,
      }),
    )
    localStorage.setItem(ACCOUNT_LINK_STORAGE_KEY, '1')
  } catch (_) {
    /* ignore quota */
  }
}

function persistAccountSummary(account) {
  if (!account || typeof account !== 'object') return
  try {
    sessionStorage.setItem(
      ACCOUNT_SUMMARY_SESSION_KEY,
      JSON.stringify({
        energy_balance: account.energy_balance,
        display_label: account.display_label,
        digital_gear_count: account.digital_gear_count,
        ronin_gear_count: account.ronin_gear_count,
        base_gear_count: account.base_gear_count,
        primary_gear_label: account.primary_gear_label,
      }),
    )
    localStorage.setItem(ACCOUNT_LINK_STORAGE_KEY, '1')
  } catch (_) {
    /* ignore */
  }
}

function clearLinkedAccountLocal() {
  try {
    localStorage.removeItem(WEB_SESSION_STORAGE_KEY)
    localStorage.removeItem(ACCOUNT_LINK_STORAGE_KEY)
  } catch (_) {
    /* ignore */
  }
  try {
    sessionStorage.removeItem(ACCOUNT_SUMMARY_SESSION_KEY)
  } catch (_) {
    /* ignore */
  }
}

function stripLinkTokenFromUrl() {
  try {
    const url = new URL(window.location.href)
    if (!url.searchParams.has('link_token')) return
    url.searchParams.delete('link_token')
    const next = `${url.pathname}${url.search}${url.hash}`
    window.history.replaceState({}, document.title, next || url.pathname)
  } catch (_) {
    /* ignore */
  }
}

async function consumeLinkTokenFromUrl() {
  const linkToken = qs('link_token')
  if (!linkToken) return false

  stripLinkTokenFromUrl()

  const fn = cfg().linkVerifyFunction || 'marketplace-link-verify'
  try {
    const { status, data } = await invokeFunction(fn, { link_token: linkToken })
    if (status >= 200 && status < 300 && data?.success && data.session_token && data.account) {
      persistWebSession(data.session_token, data.expires_at)
      persistAccountSummary(data.account)
      syncAccountHeaderButton()
      showToast('Move+ account linked.', null, null)
      if (state.view === 'checkout') render()
      return true
    }
    const msg =
      (data && (data.error || data.message)) ||
      'Could not link Move+ account. Open the marketplace from the Move+ app while signed in.'
    showToast(String(msg), null, null)
  } catch (err) {
    showToast(err?.message || 'Could not link Move+ account.', null, null)
  }
  return false
}

async function refreshLinkedAccountSummary({ silent = false } = {}) {
  const session = getStoredWebSession()
  if (!session) {
    syncAccountHeaderButton()
    return null
  }

  const fn = cfg().accountSummaryFunction || 'marketplace-account-summary'
  try {
    const { status, data } = await invokeFunction(fn, {
      session_token: session.session_token,
    })
    if (status >= 200 && status < 300 && data?.success && data.account) {
      if (data.expires_at) persistWebSession(session.session_token, data.expires_at)
      persistAccountSummary(data.account)
      syncAccountHeaderButton()
      if (state.view === 'checkout') render()
      if (!silent) showToast('Account refreshed.', null, null)
      return data.account
    }
    if (status === 401) {
      clearLinkedAccountLocal()
      syncAccountHeaderButton()
      if (!silent) showToast('Session expired. Link your Move+ account again.', null, null)
      if (state.view === 'checkout') render()
    } else if (!silent) {
      showToast((data && (data.error || data.message)) || 'Could not refresh account.', null, null)
    }
  } catch (err) {
    if (!silent) showToast(err?.message || 'Could not refresh account.', null, null)
  }
  return null
}

async function disconnectLinkedAccount() {
  const session = getStoredWebSession()
  const fn = cfg().linkDisconnectFunction || 'marketplace-link-disconnect'
  if (session?.session_token) {
    try {
      await invokeFunction(fn, { session_token: session.session_token })
    } catch (_) {
      /* local clear still proceeds */
    }
  }
  clearLinkedAccountLocal()
  syncAccountHeaderButton()
  closeModal()
  showToast('Move+ account disconnected on this browser.', null, null)
  if (state.view === 'checkout') render()
}

function isMoveplusAccountLinked() {
  const configFlag = parseBoolean(cfg().moveplusAccountLinked)
  if (configFlag != null) return configFlag
  if (getStoredWebSession()) return true
  // Same-tab summary immediately after verify (before/while session persist).
  try {
    return Boolean(sessionStorage.getItem(ACCOUNT_SUMMARY_SESSION_KEY))
  } catch (_) {
    return false
  }
}

/**
 * Safe linked-account summary only (Energy + display label + gear counts).
 * Never stores email/phone/wallets in long-term localStorage.
 * Prefer short-lived sessionStorage from link-verify; config can override for testing.
 */
function getLinkedAccountSummary() {
  const linked = isMoveplusAccountLinked()
  if (!linked) {
    return {
      linked: false,
      energyBalance: null,
      displayLabel: null,
      digitalGearCount: null,
      roninGearCount: null,
      baseGearCount: null,
      primaryGearLabel: null,
    }
  }

  let energyBalance = null
  let displayLabel = null
  let digitalGearCount = null
  let roninGearCount = null
  let baseGearCount = null
  let primaryGearLabel = null

  const cfgBalance = cfg().moveplusEnergyBalance
  if (cfgBalance != null && cfgBalance !== '' && Number.isFinite(Number(cfgBalance))) {
    energyBalance = Math.max(0, Math.floor(Number(cfgBalance)))
  }
  if (typeof cfg().moveplusDisplayName === 'string' && cfg().moveplusDisplayName.trim()) {
    displayLabel = cfg().moveplusDisplayName.trim().slice(0, 40)
  }

  try {
    const raw = sessionStorage.getItem(ACCOUNT_SUMMARY_SESSION_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        if (Number.isFinite(Number(parsed.energy_balance))) {
          energyBalance = Math.max(0, Math.floor(Number(parsed.energy_balance)))
        }
        if (typeof parsed.display_label === 'string' && parsed.display_label.trim()) {
          displayLabel = parsed.display_label.trim().slice(0, 40)
        }
        if (Number.isFinite(Number(parsed.digital_gear_count))) {
          digitalGearCount = Math.max(0, Math.floor(Number(parsed.digital_gear_count)))
        }
        if (Number.isFinite(Number(parsed.ronin_gear_count))) {
          roninGearCount = Math.max(0, Math.floor(Number(parsed.ronin_gear_count)))
        }
        if (Number.isFinite(Number(parsed.base_gear_count))) {
          baseGearCount = Math.max(0, Math.floor(Number(parsed.base_gear_count)))
        }
        if (typeof parsed.primary_gear_label === 'string' && parsed.primary_gear_label.trim()) {
          primaryGearLabel = parsed.primary_gear_label.trim().slice(0, 48)
        }
      }
    }
  } catch (_) {
    /* ignore */
  }

  return {
    linked: true,
    energyBalance,
    displayLabel,
    digitalGearCount,
    roninGearCount,
    baseGearCount,
    primaryGearLabel,
  }
}

function formatEnergyBalanceLabel(balance) {
  if (balance == null || !Number.isFinite(Number(balance))) return '—'
  return Number(balance).toLocaleString()
}

function syncAccountHeaderButton() {
  const btn = document.getElementById('btn-account')
  const icon = document.getElementById('account-header-icon')
  if (!btn || !icon) return

  const linked = isMoveplusAccountLinked()
  icon.classList.add('account-icon-img', 'original-color')
  if (linked) {
    icon.src = ACCOUNT_WALLET_ICON_PATH
    btn.setAttribute('aria-label', 'Move+ Account')
    btn.setAttribute('title', 'Move+ Account')
  } else {
    icon.src = ACCOUNT_LINK_ICON_PATH
    btn.setAttribute('aria-label', 'Link Move+ Account')
    btn.setAttribute('title', 'Link Move+ Account')
  }
}

function buildAccountModalBody(leadText, noteTexts) {
  const container = document.createDocumentFragment()
  const lead = document.createElement('p')
  lead.className = 'modal-lead'
  lead.textContent = leadText
  container.appendChild(lead)
  noteTexts.forEach((text) => {
    const note = document.createElement('p')
    note.className = 'modal-note'
    note.textContent = text
    container.appendChild(note)
  })
  return container
}

function openMoveplusAccountSheet() {
  const summary = getLinkedAccountSummary()
  const appUrl = cfg().moveplusAppDeepLink || cfg().moveplusHomeUrl || 'https://amayatoken.online/moveplus/'

  if (summary.linked) {
    const notes = []
    notes.push(
      summary.energyBalance != null
        ? `Energy balance: ${formatEnergyBalanceLabel(summary.energyBalance)}`
        : 'Energy balance will appear here after sync.',
    )
    if (summary.digitalGearCount != null) {
      notes.push(`Digital Gear: ${summary.digitalGearCount}`)
    }
    if (summary.roninGearCount != null || summary.baseGearCount != null) {
      notes.push(
        `Ronin ${summary.roninGearCount ?? 0} · Base ${summary.baseGearCount ?? 0}`,
      )
    }
    if (summary.primaryGearLabel) {
      notes.push(`Equipped: ${summary.primaryGearLabel}`)
    }
    notes.push('MiniPay crypto checkout is still available without Energy.')

    openModal({
      title: 'Move+ Account Connected',
      bodyElement: buildAccountModalBody(
        summary.displayLabel
          ? `Signed in as ${summary.displayLabel}.`
          : 'Your Move+ account is linked.',
        notes,
      ),
      primaryLabel: 'Refresh',
      primaryAction: () => {
        void refreshLinkedAccountSummary({ silent: false }).then(() => {
          if (isMoveplusAccountLinked()) openMoveplusAccountSheet()
        })
      },
      secondaryLabel: 'Disconnect',
      secondaryAction: () => {
        void disconnectLinkedAccount()
      },
    })
    return
  }

  openLinkMoveplusAccountModal()
}

function openLinkMoveplusAccountModal() {
  const appUrl = cfg().moveplusAppDeepLink || cfg().moveplusHomeUrl || 'https://amayatoken.online/moveplus/'
  openModal({
    title: 'Link Move+ Account',
    bodyElement: buildAccountModalBody(
      'Link your Move+ account to pay with Energy Points and view your balance.',
      [
        'Open the web marketplace from the Move+ app while signed in to link securely.',
        'MiniPay crypto checkout is still available without linking.',
      ],
    ),
    primaryLabel: 'Open Move+ App to Link',
    primaryAction: () => openExternalUrl(appUrl),
    secondaryLabel: 'Not now',
    secondaryAction: closeModal,
  })
}

function openEnergyComingSoonModal() {
  const appUrl = cfg().moveplusAppDeepLink || cfg().moveplusHomeUrl || 'https://amayatoken.online/moveplus/'
  openModal({
    title: 'Pay with ENERGY',
    bodyElement: buildAccountModalBody(
      'Energy checkout on web is coming soon. You can redeem Energy inside the Move+ app.',
      ['MiniPay USDT / USDC / cUSD checkout is available now for Real Items.'],
    ),
    primaryLabel: 'Open Move+ App',
    primaryAction: () => openExternalUrl(appUrl),
    secondaryLabel: 'Not now',
    secondaryAction: closeModal,
  })
}

function openInsufficientEnergyModal(balance, required) {
  openModal({
    title: 'Insufficient Energy',
    bodyElement: buildAccountModalBody('Insufficient Energy balance.', [
      `Your balance: ${formatEnergyBalanceLabel(balance)} ENERGY`,
      `Cart total: ${formatEnergyBalanceLabel(required)} ENERGY`,
      'Earn more Energy in the Move+ app, or pay with MiniPay (USDT / USDC / cUSD).',
    ]),
    primaryLabel: 'OK',
    primaryAction: closeModal,
    secondaryLabel: null,
    secondaryAction: null,
  })
}

function handleEnergyPayClick(requiredEnergy) {
  const summary = getLinkedAccountSummary()

  if (!summary.linked) {
    openLinkMoveplusAccountModal()
    return
  }

  const required = Math.max(0, Math.floor(Number(requiredEnergy) || 0))
  const balance = summary.energyBalance

  if (balance != null && Number.isFinite(balance) && balance < required) {
    openInsufficientEnergyModal(balance, required)
    return
  }

  // V1: no web Energy deduction — backend checkout not enabled yet.
  openEnergyComingSoonModal()
}

function closeAllHeaderOverlays() {
  state.ui.menuOpen = false
  state.ui.filterOpen = false
  closeMenuDrawer()
  closeFilterSheet()
  closeModal()
  setOverlayVisible(false)
}

function openModal({
  title,
  body,
  bodyElement,
  primaryLabel,
  primaryAction,
  secondaryLabel,
  secondaryAction,
}) {
  const modal = document.getElementById('mp-modal')
  if (!modal) return
  modal.innerHTML = ''

  const titleEl = document.createElement('h2')
  titleEl.className = 'modal-title'
  titleEl.textContent = title
  modal.appendChild(titleEl)

  const bodyWrap = document.createElement('div')
  bodyWrap.className = 'modal-body'
  if (bodyElement) {
    bodyWrap.appendChild(bodyElement)
  } else if (body) {
    const p = document.createElement('p')
    p.textContent = body
    bodyWrap.appendChild(p)
  }
  modal.appendChild(bodyWrap)

  const actions = document.createElement('div')
  actions.className = 'modal-actions'
  if (primaryLabel) {
    const primaryBtn = document.createElement('button')
    primaryBtn.type = 'button'
    primaryBtn.className = 'btn btn-primary'
    primaryBtn.id = 'mp-modal-primary'
    primaryBtn.textContent = primaryLabel
    actions.appendChild(primaryBtn)
  }
  if (secondaryLabel) {
    const secondaryBtn = document.createElement('button')
    secondaryBtn.type = 'button'
    secondaryBtn.className = 'btn btn-secondary'
    secondaryBtn.id = 'mp-modal-secondary'
    secondaryBtn.textContent = secondaryLabel
    actions.appendChild(secondaryBtn)
  }
  modal.appendChild(actions)

  modal.classList.remove('hidden')
  modal.setAttribute('aria-hidden', 'false')
  updateOverlayState()
  document.getElementById('mp-modal-primary')?.addEventListener('click', () => {
    primaryAction?.()
    closeModal()
  })
  document.getElementById('mp-modal-secondary')?.addEventListener('click', () => {
    secondaryAction?.()
    closeModal()
  })
}

function closeModal() {
  const modal = document.getElementById('mp-modal')
  if (!modal) return
  modal.classList.add('hidden')
  modal.setAttribute('aria-hidden', 'true')
  modal.innerHTML = ''
  updateOverlayState()
}

function openMenuDrawer() {
  const drawer = document.getElementById('menu-drawer')
  if (!drawer) return
  const homeUrl = cfgUrl('moveplusHomeUrl', 'https://amayatoken.online/moveplus')
  const supportUrl = cfgUrl('supportUrl', 'https://amayatoken.online/moveplus/support')
  const appUrl = cfgUrl('moveplusAppDeepLink', homeUrl)

  drawer.innerHTML = `
    <div class="menu-drawer-header">
      <h2 class="menu-drawer-title">Menu</h2>
      <button type="button" class="icon-button" id="menu-close" aria-label="Close menu">
        <svg class="header-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
      </button>
    </div>
    <ul class="menu-list">
      <li class="menu-item"><button type="button" class="menu-link" data-menu="marketplace">Marketplace</button></li>
      <li class="menu-item">
        <button type="button" class="menu-link" data-menu="earn">
          Earn Rewards
          <small>Walk, run, or cycle in Move+ to earn Energy.</small>
        </button>
      </li>
      <li class="menu-item"><button type="button" class="menu-link" data-menu="orders">My Orders / Track Order</button></li>
      <li class="menu-item"><button type="button" class="menu-link" data-menu="delivery">Delivery Info</button></li>
      <li class="menu-item"><button type="button" class="menu-link" data-menu="open-app">Open Move+ App</button></li>
      <li class="menu-item menu-settings">
        <button
          type="button"
          class="menu-link menu-settings-toggle"
          id="menu-settings-toggle"
          aria-expanded="${state.ui.menuSettingsOpen ? 'true' : 'false'}"
          aria-controls="menu-settings-panel"
        >
          <span>Settings</span>
          <svg class="menu-settings-chevron${state.ui.menuSettingsOpen ? ' expanded' : ''}" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
        <ul
          id="menu-settings-panel"
          class="menu-sublist${state.ui.menuSettingsOpen ? '' : ' hidden'}"
          role="group"
          aria-label="Settings"
        >
          <li class="menu-subitem"><button type="button" class="menu-link menu-sublink" data-menu="terms">Terms of Service</button></li>
          <li class="menu-subitem"><button type="button" class="menu-link menu-sublink" data-menu="privacy">Privacy Policy</button></li>
          <li class="menu-subitem"><button type="button" class="menu-link menu-sublink" data-menu="refund">Refund Policy</button></li>
          <li class="menu-subitem"><button type="button" class="menu-link menu-sublink" data-menu="support">Support</button></li>
        </ul>
      </li>
    </ul>
  `

  drawer.classList.remove('hidden')
  drawer.setAttribute('aria-hidden', 'false')
  updateOverlayState()

  document.getElementById('menu-close')?.addEventListener('click', closeMenuDrawer)

  const settingsToggle = document.getElementById('menu-settings-toggle')
  const settingsPanel = document.getElementById('menu-settings-panel')
  settingsToggle?.addEventListener('click', () => {
    state.ui.menuSettingsOpen = !state.ui.menuSettingsOpen
    const expanded = state.ui.menuSettingsOpen
    settingsToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false')
    settingsPanel?.classList.toggle('hidden', !expanded)
    settingsToggle.querySelector('.menu-settings-chevron')?.classList.toggle('expanded', expanded)
  })

  drawer.querySelectorAll('[data-menu]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.getAttribute('data-menu')
      closeMenuDrawer()
      if (action === 'marketplace') {
        setView('catalog')
        return
      }
      if (action === 'earn') {
        openExternalUrl(homeUrl)
        return
      }
      if (action === 'orders') {
        openTrackOrdersModal()
        return
      }
      if (action === 'terms') {
        openLegalPage('terms')
        return
      }
      if (action === 'privacy') {
        openLegalPage('privacy')
        return
      }
      if (action === 'refund') {
        openLegalPage('refund')
        return
      }
      if (action === 'support') {
        openExternalUrl(supportUrl)
        return
      }
      if (action === 'delivery') {
        openModal({
          title: 'Delivery Info',
          body: 'Philippines delivery only. Orders are reviewed before fulfillment.',
          primaryLabel: 'OK',
          primaryAction: () => {},
        })
        return
      }
      if (action === 'open-app') {
        window.location.href = appUrl
      }
    })
  })
}

function updateOverlayState() {
  const modal = document.getElementById('mp-modal')
  const modalOpen = modal && !modal.classList.contains('hidden')
  setOverlayVisible(Boolean(state.ui.menuOpen || state.ui.filterOpen || modalOpen))
}

function closeMenuDrawer() {
  state.ui.menuOpen = false
  const drawer = document.getElementById('menu-drawer')
  const btnMenu = document.getElementById('btn-menu')
  if (drawer) {
    drawer.classList.add('hidden')
    drawer.setAttribute('aria-hidden', 'true')
  }
  btnMenu?.setAttribute('aria-expanded', 'false')
  updateOverlayState()
}

function openTrackOrdersModal() {
  const supportUrl = cfgUrl('supportUrl', 'https://amayatoken.online/moveplus/support')
  openModal({
    title: 'Track Orders',
    body: 'Order tracking will be available soon. For support, contact Move+.',
    primaryLabel: 'Support',
    primaryAction: () => openExternalUrl(supportUrl),
    secondaryLabel: 'Close',
    secondaryAction: () => {},
  })
}

function toggleSearchBar(force) {
  const bar = document.getElementById('search-bar')
  const input = document.getElementById('search-input')
  const btnSearch = document.getElementById('btn-search')
  if (!bar || !input) return

  const next = typeof force === 'boolean' ? force : !state.ui.searchOpen
  state.ui.searchOpen = next
  bar.classList.toggle('hidden', !next)
  btnSearch?.classList.toggle('active', next)

  if (next) {
    input.value = state.ui.searchQuery
    input.focus()
  } else if (!state.ui.searchQuery.trim()) {
    input.value = ''
  }
}

function clearSearch() {
  state.ui.searchQuery = ''
  const input = document.getElementById('search-input')
  if (input) input.value = ''
  if (state.view === 'catalog') render()
}

function openFilterSheet() {
  const sheet = document.getElementById('filter-sheet')
  if (!sheet) return
  state.ui.filterOpen = true

  const isGear = state.catalogTab === 'gear'
  const categories = getActiveCategories()
  const sortOptions = isGear
    ? [
        ['featured', 'Featured'],
        ['newest', 'Name A–Z'],
      ]
    : [
        ['featured', 'Featured'],
        ['energy_low', 'Energy: low to high'],
        ['energy_high', 'Energy: high to low'],
        ['newest', 'Newest'],
      ]

  sheet.innerHTML = `
    <div class="sheet-handle" aria-hidden="true"></div>
    <h2 class="sheet-title" id="filter-sheet-title">${isGear ? 'Filter digital gear' : 'Filter products'}</h2>
    <div class="filter-group">
      <span class="filter-label">Category</span>
      <div class="filter-options" id="filter-categories">
        ${categories
          .map(
            (cat) =>
              `<button type="button" class="filter-option ${state.selectedCategory === cat ? 'active' : ''}" data-cat="${escapeHtml(cat)}">${escapeHtml(cat)}</button>`,
          )
          .join('')}
      </div>
    </div>
    ${
      isGear
        ? ''
        : `<div class="filter-group">
      <span class="filter-label">Energy price range</span>
      <div class="filter-range">
        <input type="number" id="filter-energy-min" placeholder="Min EP" min="0" inputmode="numeric" value="${escapeHtml(state.filters.energyMin)}" />
        <input type="number" id="filter-energy-max" placeholder="Max EP" min="0" inputmode="numeric" value="${escapeHtml(state.filters.energyMax)}" />
      </div>
    </div>
    <div class="filter-group">
      <span class="filter-label">Availability</span>
      <div class="filter-options" id="filter-availability">
        <button type="button" class="filter-option ${state.filters.availability === 'all' ? 'active' : ''}" data-avail="all">All</button>
        <button type="button" class="filter-option ${state.filters.availability === 'available' ? 'active' : ''}" data-avail="available">Available only</button>
      </div>
    </div>`
    }
    <div class="filter-group">
      <span class="filter-label">Sort</span>
      <div class="filter-options" id="filter-sort">
        ${sortOptions
          .map(
            ([val, label]) =>
              `<button type="button" class="filter-option ${state.filters.sort === val ? 'active' : ''}" data-sort="${val}">${escapeHtml(label)}</button>`,
          )
          .join('')}
      </div>
    </div>
    <div class="sheet-actions">
      <button type="button" class="btn btn-secondary" id="filter-reset">Reset</button>
      <button type="button" class="btn btn-primary" id="filter-apply">Apply</button>
    </div>
  `

  sheet.classList.remove('hidden')
  sheet.setAttribute('aria-hidden', 'false')
  updateOverlayState()
  document.getElementById('btn-filter')?.classList.add('active')

  sheet.querySelectorAll('[data-cat]').forEach((btn) => {
    btn.addEventListener('click', () => {
      sheet.querySelectorAll('[data-cat]').forEach((b) => b.classList.remove('active'))
      btn.classList.add('active')
    })
  })
  sheet.querySelectorAll('[data-avail]').forEach((btn) => {
    btn.addEventListener('click', () => {
      sheet.querySelectorAll('[data-avail]').forEach((b) => b.classList.remove('active'))
      btn.classList.add('active')
    })
  })
  sheet.querySelectorAll('[data-sort]').forEach((btn) => {
    btn.addEventListener('click', () => {
      sheet.querySelectorAll('[data-sort]').forEach((b) => b.classList.remove('active'))
      btn.classList.add('active')
    })
  })

  document.getElementById('filter-reset')?.addEventListener('click', () => {
    state.selectedCategory = 'All'
    state.filters = { sort: 'featured', availability: 'all', energyMin: '', energyMax: '' }
    closeFilterSheet()
    if (state.view === 'catalog') render()
  })

  document.getElementById('filter-apply')?.addEventListener('click', () => {
    const catBtn = sheet.querySelector('[data-cat].active')
    state.selectedCategory = catBtn?.getAttribute('data-cat') || 'All'
    if (!isGear) {
      const availBtn = sheet.querySelector('[data-avail].active')
      state.filters.availability = availBtn?.getAttribute('data-avail') || 'all'
      state.filters.energyMin = document.getElementById('filter-energy-min')?.value?.trim() ?? ''
      state.filters.energyMax = document.getElementById('filter-energy-max')?.value?.trim() ?? ''
    }
    const sortBtn = sheet.querySelector('[data-sort].active')
    state.filters.sort = sortBtn?.getAttribute('data-sort') || 'featured'
    closeFilterSheet()
    if (state.view === 'catalog') render()
  })
}

function closeFilterSheet() {
  state.ui.filterOpen = false
  const sheet = document.getElementById('filter-sheet')
  if (sheet) {
    sheet.classList.add('hidden')
    sheet.setAttribute('aria-hidden', 'true')
  }
  const btnFilter = document.getElementById('btn-filter')
  if (hasActiveFilters()) btnFilter?.classList.add('active')
  else btnFilter?.classList.remove('active')
  updateOverlayState()
}

function initHeaderUi() {
  const btnMenu = document.getElementById('btn-menu')
  const btnSearch = document.getElementById('btn-search')
  const btnFilter = document.getElementById('btn-filter')
  const btnCart = document.getElementById('btn-cart')
  const btnAccount = document.getElementById('btn-account')
  const btnClear = document.getElementById('btn-search-clear')
  const searchInput = document.getElementById('search-input')
  const overlay = document.getElementById('ui-overlay')

  syncAccountHeaderButton()

  btnMenu?.addEventListener('click', () => {
    if (state.ui.menuOpen) {
      closeMenuDrawer()
      return
    }
    closeFilterSheet()
    closeModal()
    state.ui.menuOpen = true
    btnMenu.setAttribute('aria-expanded', 'true')
    openMenuDrawer()
  })

  btnSearch?.addEventListener('click', () => toggleSearchBar())

  btnClear?.addEventListener('click', () => clearSearch())

  searchInput?.addEventListener('input', (e) => {
    state.ui.searchQuery = e.target.value
    if (state.view === 'catalog') render()
  })

  btnFilter?.addEventListener('click', () => {
    if (state.ui.filterOpen) {
      closeFilterSheet()
      return
    }
    closeMenuDrawer()
    closeModal()
    openFilterSheet()
  })

  btnCart?.addEventListener('click', () => {
    closeMenuDrawer()
    closeFilterSheet()
    setView('cart')
  })

  btnAccount?.addEventListener('click', () => {
    closeMenuDrawer()
    closeFilterSheet()
    openMoveplusAccountSheet()
  })

  overlay?.addEventListener('click', () => {
    closeMenuDrawer()
    closeFilterSheet()
    closeModal()
  })
}

document.addEventListener('DOMContentLoaded', boot)
