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
const CART_STORAGE_KEY = 'moveplus_web_marketplace_cart_v1'

const state = {
  view: 'catalog',
  catalogTab: 'real',
  items: [],
  gearItems: [],
  cart: [],
  selectedCategory: 'All',
  selectedItem: null,
  checkoutSession: null,
  loading: true,
  error: null,
  catalogMeta: null,
  isMiniPay: false,
  toastTimer: null,
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
  const symbol = product.cryptoSymbol || cfg().cryptoTokenSymbol || 'cUSD'
  return `${formatMoneyAmount(amount)} ${symbol}`
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
  let tokenSymbol = null
  let hasPrice = false
  for (const line of lines) {
    const unit = Number(line.product.cryptoPrice)
    if (!Number.isFinite(unit) || unit <= 0) continue
    total += unit * line.quantity
    hasPrice = true
    if (!tokenSymbol && line.product.cryptoSymbol) {
      tokenSymbol = line.product.cryptoSymbol
    }
  }
  if (!hasPrice) {
    return { display: '—', tokenSymbol: null, hasPrice: false }
  }
  return {
    display: `${formatMoneyAmount(total)} ${tokenSymbol || cfg().cryptoTokenSymbol || 'cUSD'}`,
    tokenSymbol: tokenSymbol || cfg().cryptoTokenSymbol || 'cUSD',
    hasPrice: true,
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
  if (view === 'payment' && !state.checkoutSession) {
    view = state.cart.length > 0 ? 'checkout' : 'catalog'
  }
  if ((view === 'checkout' || view === 'payment') && (state.catalogTab !== 'real' || getCartLines().length === 0)) {
    view = 'cart'
  }
  state.view = view
  if (payload.item) state.selectedItem = payload.item
  if (payload.session) state.checkoutSession = payload.session
  closeAllHeaderOverlays()
  hideToast()
  render()
  syncWalletDetection()
  syncCartBadge()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function syncWalletDetection() {
  state.isMiniPay = isMiniPayWallet()
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
  document.getElementById('buy-now-btn')?.addEventListener('click', () => {
    if (!addToCart(product, 1)) return
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
  document.getElementById('cart-checkout-btn')?.addEventListener('click', () => setView('checkout'))

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
  const appUrl = cfg().moveplusAppDeepLink || cfg().moveplusHomeUrl || 'https://amayatoken.online/moveplus/'
  const minipayReady = minipayEnabled && inMiniPay && totals.hasCryptoPrices
  const minipayBlockedReason = !totals.hasCryptoPrices
    ? 'Set crypto prices in Admin Dashboard before MiniPay checkout.'
    : null

  main.innerHTML = `
    <button type="button" class="btn btn-ghost" id="back-cart">← Back to cart</button>
    <section class="card">
      <h2 class="detail-title" style="font-size:17px">Checkout</h2>
      <div class="checkout-summary">${renderCheckoutSummaryHtml(totals)}</div>
      <div class="meta-row"><span class="meta-label">Total Energy</span><span class="meta-value">${formatEnergyPriceHtml(totals.totalEnergy)}</span></div>
      <div class="meta-row"><span class="meta-label">Total crypto (est.)</span><span class="meta-value">${escapeHtml(totals.cryptoSubtotal)}</span></div>
      <div class="meta-row"><span class="meta-label">Delivery</span><span class="meta-value">Philippines only</span></div>
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
      <div class="alert alert-info">Energy redemption is available inside the Move+ app. Open Move+ to pay with Energy Points.</div>
      ${
        minipayBlockedReason
          ? `<div class="alert alert-warn">${escapeHtml(minipayBlockedReason)}</div>`
          : ''
      }
      ${
        !inMiniPay
          ? `<div class="alert alert-warn">Wallet signing is unavailable in a normal browser. Open inside MiniPay to pay with crypto.</div>`
          : minipayEnabled
            ? `<div class="alert alert-info">MiniPay detected. Server will calculate your final payment amount from product prices.</div>`
            : `<div class="alert alert-warn">MiniPay checkout is coming soon.</div>`
      }
    </section>
    ${diagnosticsHtml()}
    <div class="action-bar" id="checkout-actions">
      <button type="button" class="btn btn-secondary" id="energy-info-btn">Pay with Energy in Move+ app</button>
      <button type="button" class="btn btn-primary ${!minipayReady ? 'btn-disabled' : ''}" id="minipay-checkout-btn" ${!minipayReady ? 'disabled' : ''}>
        ${minipayReady ? `Pay ${escapeHtml(totals.cryptoSubtotal)} with MiniPay` : 'Open inside MiniPay to pay'}
      </button>
    </div>
  `

  document.getElementById('back-cart')?.addEventListener('click', () => setView('cart'))
  document.getElementById('energy-info-btn')?.addEventListener('click', () => {
    openExternalUrl(appUrl)
  })
  document.getElementById('minipay-checkout-btn')?.addEventListener('click', () => startMinipayCheckout())
}

async function startMinipayCheckout() {
  if (state.catalogTab !== 'real') return
  if (!isMiniPayWallet()) return
  if (cfg().enableMiniPayCheckout === false) return
  if (getCartLines().length === 0) return
  if (cartHasUnavailableItems()) return

  const form = document.getElementById('checkout-form')
  const statusEl = document.getElementById('checkout-status')
  if (!form || !statusEl) return
  if (!form.reportValidity()) return

  const body = {
    items: buildCheckoutItemsPayload(),
    customer_name: form.customer_name.value.trim(),
    phone_number: form.phone_number.value.trim(),
    email: form.email.value.trim(),
    delivery_address: form.delivery_address.value.trim(),
    comments: form.comments.value.trim() || null,
  }

  const payBtn = document.getElementById('minipay-checkout-btn')
  if (payBtn) {
    payBtn.disabled = true
    payBtn.textContent = 'Creating checkout…'
  }
  statusEl.innerHTML = `<div class="alert alert-info">Creating checkout session…</div>`

  try {
    const fn = cfg().createSessionFunction || 'minipay-checkout-create-session'
    const { status, data } = await invokeFunction(fn, body)
    if (!data?.success) {
      throw new Error(friendlyApiError(status, data))
    }

    setView('payment', {
      session: {
        sessionId: data.session_id,
        sessionToken: data.session_token,
        itemTitle: data.item_title || 'Order',
        amountDisplay: data.amount_display,
        tokenSymbol: data.token_symbol,
        chainName: data.chain_name || 'Celo',
        treasuryAddress: data.treasury_address,
        amountRaw: data.amount_raw,
        tokenAddress: data.token_address,
        chainId: data.chain_id,
        expiresAt: data.expires_at,
        cartItems: data.cart_items ?? null,
        totalQuantity: data.total_quantity ?? null,
      },
    })
  } catch (err) {
    statusEl.innerHTML = `<div class="alert alert-error">${escapeHtml(String(err.message ?? err))}</div>`
    if (payBtn) {
      payBtn.disabled = false
      const totals = getCartTotals()
      payBtn.textContent = `Pay ${totals.cryptoSubtotal} with MiniPay`
    }
  }
}

function renderPayment(main) {
  const session = state.checkoutSession
  if (!session || state.catalogTab !== 'real') {
    setView('cart')
    return
  }

  const inMiniPay = isMiniPayWallet()
  const payLabel = inMiniPay
    ? `Pay ${escapeHtml(session.amountDisplay || '—')}`.trim()
    : 'Open inside MiniPay to pay'

  main.innerHTML = `
    <button type="button" class="btn btn-ghost" id="back-checkout">← Back to checkout</button>
    <section class="card">
      <h2 class="detail-title" style="font-size:17px">Payment</h2>
      <div class="meta-row"><span class="meta-label">Order</span><span class="meta-value">${escapeHtml(session.itemTitle || 'Items')}</span></div>
      <div class="meta-row"><span class="meta-label">Amount</span><span class="meta-value">${escapeHtml(session.amountDisplay || '—')}</span></div>
      <div class="meta-row"><span class="meta-label">Network</span><span class="meta-value">${escapeHtml(session.chainName || 'Celo')}</span></div>
      <div class="meta-row"><span class="meta-label">Delivery</span><span class="meta-value">Philippines only</span></div>
      <div class="meta-row"><span class="meta-label">Status</span><span class="meta-value" id="checkout-live-status">pending</span></div>
    </section>
    ${
      !inMiniPay
        ? `<section class="card"><div class="alert alert-warn">Wallet signing is unavailable in a normal browser. Open inside MiniPay to complete payment.</div></section>`
        : `<section class="card"><div class="alert alert-info">MiniPay detected. Tap below to connect your wallet and confirm payment.</div><div class="meta-row" id="wallet-line" style="display:none"><span class="meta-label">Wallet</span><span class="meta-value" id="wallet-addr">—</span></div></section>`
    }
    <section class="card" id="payment-status-box" style="display:none"></section>
    ${diagnosticsHtml()}
    <div class="action-bar">
      <button type="button" class="btn btn-primary ${inMiniPay ? '' : 'btn-disabled'}" id="confirm-pay-btn" ${inMiniPay ? '' : 'disabled'}>${payLabel}</button>
    </div>
  `

  document.getElementById('back-checkout')?.addEventListener('click', () => setView('checkout'))

  const payBtn = document.getElementById('confirm-pay-btn')
  if (!inMiniPay || !payBtn) return

  payBtn.addEventListener('click', () => confirmMinipayPayment(session))
}

async function invokeVerify(body) {
  const fn = cfg().verifyFunction || 'minipay-checkout-verify-payment'
  return invokeFunction(fn, body)
}

async function confirmMinipayPayment(session) {
  if (!isMiniPayWallet()) return

  const payBtn = document.getElementById('confirm-pay-btn')
  const statusBox = document.getElementById('payment-status-box')
  const walletLine = document.getElementById('wallet-line')
  const walletAddrEl = document.getElementById('wallet-addr')
  if (!payBtn || !statusBox) return

  payBtn.disabled = true
  statusBox.style.display = 'block'
  statusBox.innerHTML = `<div class="alert alert-info">Connecting wallet…</div>`

  try {
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
    const payer = normalizeAddr(accounts?.[0])
    if (!payer) throw new Error('No wallet address returned')

    if (walletLine) walletLine.style.display = 'flex'
    if (walletAddrEl) walletAddrEl.textContent = shortAddr(payer)

    statusBox.innerHTML = `<div class="alert alert-info">Confirm payment in MiniPay…</div>`

    const dataHex = encodeErc20Transfer(session.treasuryAddress, session.amountRaw)
    const txParams = {
      from: payer,
      to: session.tokenAddress,
      data: dataHex,
      value: '0x0',
      chainId: chainIdHex(session.chainId),
    }

    const txHash = await window.ethereum.request({
      method: 'eth_sendTransaction',
      params: [txParams],
    })

    statusBox.innerHTML = `<div class="alert alert-info">Verifying payment…</div>`

    const { status, data } = await invokeVerify({
      session_id: session.sessionId,
      session_token: session.sessionToken,
      tx_hash: txHash,
      payer_wallet_address: payer,
    })

    if (!data?.success || data.status !== 'paid') {
      throw new Error(friendlyApiError(status, data))
    }

    setView('paid', {
      session: {
        ...session,
        txHash: data.tx_hash,
        explorerUrl: data.explorer_url,
        receiptTxHash: data.receipt_tx_hash ?? null,
        receiptExplorerUrl: data.receipt_explorer_url ?? null,
        receiptPending: data.receipt_pending === true,
        receiptRecorded: data.receipt_recorded === true || Boolean(data.receipt_tx_hash),
      },
    })
    clearCart()
  } catch (err) {
    statusBox.innerHTML = `<div class="alert alert-error">${escapeHtml(String(err.message ?? err))}</div>`
    payBtn.disabled = false
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

function isMoveplusAccountLinked() {
  const configFlag = parseBoolean(cfg().moveplusAccountLinked)
  if (configFlag != null) return configFlag
  try {
    return localStorage.getItem(ACCOUNT_LINK_STORAGE_KEY) === '1'
  } catch (_) {
    return false
  }
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
  const linked = isMoveplusAccountLinked()
  const appUrl = cfg().moveplusAppDeepLink || cfg().moveplusHomeUrl || 'https://amayatoken.online/moveplus/'

  if (linked) {
    openModal({
      title: 'Move+ Account',
      bodyElement: buildAccountModalBody('Your Move+ account is linked.', [
        'Energy balance and gear summary will appear here soon.',
        'MiniPay checkout currently applies to Real Items only.',
      ]),
      primaryLabel: 'Open Move+ App',
      primaryAction: () => openExternalUrl(appUrl),
      secondaryLabel: 'Close',
      secondaryAction: closeModal,
    })
    return
  }

  openModal({
    title: 'Link Move+ Account',
    bodyElement: buildAccountModalBody(
      'Link your Move+ account to view Energy balance and gear summary in this marketplace.',
      ['Linking is coming soon.', 'MiniPay checkout currently applies to Real Items only.'],
    ),
    primaryLabel: 'Link Move+ Account',
    primaryAction: () => showToast('Move+ account linking is coming soon.', null, null),
    secondaryLabel: 'Close',
    secondaryAction: closeModal,
  })
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
