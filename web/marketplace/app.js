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

const ERC20_TRANSFER_SELECTOR = '0xa9059cbb'

const state = {
  view: 'catalog',
  items: [],
  selectedCategory: 'All',
  selectedItem: null,
  checkoutSession: null,
  loading: true,
  error: null,
  catalogMeta: null,
  isMiniPay: false,
  ui: {
    menuOpen: false,
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
  return window.MOVEPLUS_MARKETPLACE_CONFIG || {}
}

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

/**
 * Map Supabase marketplace_items row to web catalog product.
 * Availability matches native Move+ app: is_available + is_deleted (not stock_quantity).
 */
function normalizeMarketplaceProduct(row) {
  const stockRaw = row.stock_quantity
  const stock =
    stockRaw == null || stockRaw === ''
      ? null
      : Number.isFinite(Number(stockRaw))
        ? Number(stockRaw)
        : null
  const isAvailable = row.is_available === true && row.is_deleted !== true

  return {
    id: String(row.id ?? ''),
    title: String(row.title ?? ''),
    description: String(row.description ?? ''),
    category: String(row.category ?? ''),
    imageUrl: resolveProductImage(row),
    images: resolveProductImages(row),
    energyPrice: Number(row.energy_points_price ?? 0),
    cryptoPrice: cfg().cryptoAmountDisplay || null,
    cryptoSymbol: cfg().cryptoTokenSymbol || 'cUSD',
    stock,
    isAvailable,
    // Native marketplace does not block purchases when stock_quantity is 0/null.
    isSoldOut: !isAvailable,
    createdAt: row.created_at ?? null,
  }
}

function stockDisplayLabel(product) {
  if (!product.isAvailable) return 'Unavailable'
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

function cryptoPriceLabel() {
  const c = cfg()
  const amount = c.cryptoAmountDisplay || '—'
  const token = c.cryptoTokenSymbol || 'cUSD'
  return `${amount} ${token}`
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
      'id,title,description,image_url,energy_points_price,category,stock_quantity,is_available,is_deleted,created_at,updated_at'
    const query = `${table}?select=${select}&is_available=eq.true&is_deleted=eq.false&order=created_at.desc`
    let rows = await supabaseRest(query)
    if (!Array.isArray(rows)) rows = []

    let products = rows.map(normalizeMarketplaceProduct).filter((p) => p.id && p.isAvailable)

    if (products.length === 0 && isDemoMode()) {
      products = demoProducts().map(normalizeMarketplaceProduct)
      logDebug('demoMode enabled — using sample products')
    }

    state.catalogMeta = {
      source: sourceLabel,
      rowCount: products.length,
      rawRowCount: rows.length,
      firstRowStock: rows[0]?.stock_quantity ?? '—',
      firstRowAvailable: rows[0]?.is_available ?? '—',
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
      rowCount: 0,
      rawRowCount: 0,
      firstRowStock: '—',
      firstRowAvailable: '—',
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

function hasActiveFilters() {
  return (
    state.filters.sort !== 'featured' ||
    state.filters.availability !== 'all' ||
    state.filters.energyMin !== '' ||
    state.filters.energyMax !== ''
  )
}

function setView(view, payload = {}) {
  state.view = view
  if (payload.item) state.selectedItem = payload.item
  if (payload.session) state.checkoutSession = payload.session
  closeAllHeaderOverlays()
  render()
  syncWalletDetection()
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

  return `
    <button type="button" class="product-card" data-item-id="${escapeHtml(product.id)}" ${product.isSoldOut ? 'disabled' : ''}>
      <div class="product-image-wrap">
        ${imageBlock}
        ${product.isSoldOut ? '<span class="badge">Sold out</span>' : ''}
      </div>
      <div class="product-body">
        <h2 class="product-title">${escapeHtml(product.title)}</h2>
        <div class="price-row">
          <span class="price-energy">${Number(product.energyPrice).toLocaleString()} EP</span>
          <span class="price-crypto">${escapeHtml(cryptoPriceLabel())}</span>
        </div>
      </div>
    </button>
  `
}

function renderCatalog(main) {
  if (state.loading) {
    main.innerHTML = `<section class="card loading"><div class="spinner"></div><p>Loading marketplace…</p></section>`
    return
  }

  if (state.error) {
    main.innerHTML = `
      <section class="card error">
        <p>${escapeHtml(state.error)}</p>
        <button type="button" class="btn btn-secondary" id="retry-catalog" style="margin-top:12px">Retry</button>
      </section>
      ${diagnosticsHtml()}
    `
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
    <div class="chips" role="tablist">${chips}</div>
    ${
      items.length === 0
        ? `<section class="card empty"><p>${emptyMessage}</p></section>`
        : `<div class="grid" id="product-grid">${items.map(productCardHtml).join('')}</div>`
    }
    ${diagnosticsHtml()}
  `

  main.querySelectorAll('[data-category]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.selectedCategory = btn.getAttribute('data-category') || 'All'
      render()
    })
  })

  main.querySelectorAll('[data-item-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-item-id')
      const product = state.items.find((i) => i.id === id)
      if (product && !product.isSoldOut) setView('detail', { item: product })
    })
  })
}

function renderDetail(main) {
  const product = state.selectedItem
  if (!product) {
    setView('catalog')
    return
  }

  const img = product.imageUrl
  const minipayEnabled = cfg().enableMiniPayCheckout !== false
  const inMiniPay = isMiniPayWallet()

  main.innerHTML = `
    <button type="button" class="btn btn-ghost" id="back-catalog">← Back to catalog</button>
    <div class="detail-hero">
      ${
        img
          ? `<img src="${escapeHtml(img)}" alt="" />`
          : `<div class="product-image placeholder" style="height:100%">No image</div>`
      }
    </div>
    <section class="card">
      <h2 class="detail-title">${escapeHtml(product.title)}</h2>
      <p class="detail-desc">${escapeHtml(product.description || 'No description provided.')}</p>
      <div class="meta-row"><span class="meta-label">Category</span><span class="meta-value">${escapeHtml(product.category || '—')}</span></div>
      <div class="meta-row"><span class="meta-label">Energy price</span><span class="meta-value">${Number(product.energyPrice).toLocaleString()} EP</span></div>
      <div class="meta-row"><span class="meta-label">Crypto price</span><span class="meta-value">${escapeHtml(cryptoPriceLabel())} · ${escapeHtml(cfg().chainName || 'Celo')}</span></div>
      <div class="meta-row"><span class="meta-label">Delivery</span><span class="meta-value">Philippines only</span></div>
      <div class="meta-row"><span class="meta-label">Stock</span><span class="meta-value">${escapeHtml(stockDisplayLabel(product))}</span></div>
    </section>
    <section class="card">
      <div class="alert alert-info">Energy redemption is available inside the Move+ app. Open Move+ to pay with Energy Points.</div>
      ${
        !inMiniPay
          ? `<div class="alert alert-warn">Open inside MiniPay to pay with ${escapeHtml(cfg().cryptoTokenSymbol || 'MiniPay')}. Wallet signing is unavailable in a normal browser.</div>`
          : minipayEnabled
            ? `<div class="alert alert-info">MiniPay detected. You can complete crypto checkout below.</div>`
            : `<div class="alert alert-warn">MiniPay checkout is coming soon.</div>`
      }
    </section>
    <section class="card" id="checkout-form-card">
      <h3 style="margin:0 0 12px;font-size:15px">Checkout details</h3>
      <form id="checkout-form">
        <div class="form-group"><label for="customer_name">Full name</label><input id="customer_name" name="customer_name" required autocomplete="name" /></div>
        <div class="form-group"><label for="phone_number">Phone</label><input id="phone_number" name="phone_number" required autocomplete="tel" /></div>
        <div class="form-group"><label for="email">Email</label><input id="email" name="email" type="email" required autocomplete="email" /></div>
        <div class="form-group"><label for="delivery_address">Delivery address (Philippines)</label><textarea id="delivery_address" name="delivery_address" required></textarea></div>
        <div class="form-group"><label for="comments">Comments (optional)</label><textarea id="comments" name="comments"></textarea></div>
      </form>
      <div id="checkout-status"></div>
    </section>
    ${diagnosticsHtml()}
    <div class="action-bar" id="detail-actions">
      <button type="button" class="btn btn-secondary" id="energy-info-btn">Pay with Energy in Move+ app</button>
      <button type="button" class="btn btn-primary ${!inMiniPay || !minipayEnabled || product.isSoldOut ? 'btn-disabled' : ''}" id="minipay-checkout-btn" ${!inMiniPay || !minipayEnabled || product.isSoldOut ? 'disabled' : ''}>
        ${inMiniPay && minipayEnabled && !product.isSoldOut ? `Pay ${escapeHtml(cryptoPriceLabel())} with MiniPay` : 'Open inside MiniPay to pay'}
      </button>
    </div>
  `

  document.getElementById('back-catalog')?.addEventListener('click', () => setView('catalog'))
  document.getElementById('energy-info-btn')?.addEventListener('click', () => {
    alert('Energy redemption is available inside the Move+ app marketplace.')
  })

  const payBtn = document.getElementById('minipay-checkout-btn')
  payBtn?.addEventListener('click', () => startMinipayCheckout(product))
}

async function startMinipayCheckout(product) {
  if (!isMiniPayWallet()) return
  if (cfg().enableMiniPayCheckout === false) return

  const form = document.getElementById('checkout-form')
  const statusEl = document.getElementById('checkout-status')
  if (!form || !statusEl) return

  if (!form.reportValidity()) return

  const body = {
    marketplace_item_id: product.id,
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

    setView('checkout', {
      item: product,
      session: {
        sessionId: data.session_id,
        sessionToken: data.session_token,
        itemTitle: data.item_title || product.title,
        amountDisplay: data.amount_display,
        tokenSymbol: data.token_symbol,
        chainName: data.chain_name || 'Celo',
        treasuryAddress: data.treasury_address,
        amountRaw: data.amount_raw,
        tokenAddress: data.token_address,
        chainId: data.chain_id,
        expiresAt: data.expires_at,
      },
    })
  } catch (err) {
    statusEl.innerHTML = `<div class="alert alert-error">${escapeHtml(String(err.message ?? err))}</div>`
    if (payBtn) {
      payBtn.disabled = false
      payBtn.textContent = `Pay ${cryptoPriceLabel()} with MiniPay`
    }
  }
}

async function invokeVerify(body) {
  const fn = cfg().verifyFunction || 'minipay-checkout-verify-payment'
  return invokeFunction(fn, body)
}

function renderCheckout(main) {
  const session = state.checkoutSession
  const item = state.selectedItem
  if (!session) {
    setView('catalog')
    return
  }

  const inMiniPay = isMiniPayWallet()
  const payLabel = inMiniPay
    ? `Pay ${escapeHtml(session.amountDisplay || cryptoPriceLabel())} ${escapeHtml(session.tokenSymbol || '')}`.trim()
    : 'Open inside MiniPay to pay'

  main.innerHTML = `
    <button type="button" class="btn btn-ghost" id="back-detail">← Back to product</button>
    <section class="card">
      <h2 class="detail-title" style="font-size:17px">Checkout</h2>
      <div class="meta-row"><span class="meta-label">Product</span><span class="meta-value">${escapeHtml(session.itemTitle || item?.title || 'Item')}</span></div>
      <div class="meta-row"><span class="meta-label">Amount</span><span class="meta-value">${escapeHtml(session.amountDisplay || '—')} ${escapeHtml(session.tokenSymbol || '')}</span></div>
      <div class="meta-row"><span class="meta-label">Network</span><span class="meta-value">${escapeHtml(session.chainName || 'Celo')}</span></div>
      <div class="meta-row"><span class="meta-label">Delivery</span><span class="meta-value">Philippines only</span></div>
      <div class="meta-row"><span class="meta-label">Status</span><span class="meta-value" id="checkout-live-status">pending</span></div>
    </section>
    ${
      !inMiniPay
        ? `<section class="card"><div class="alert alert-warn">MiniPay wallet not detected. Open this checkout inside MiniPay to complete payment. No wallet calls are made in browser mode.</div></section>`
        : `<section class="card"><div class="alert alert-info">MiniPay detected. Tap below to connect your wallet and confirm payment.</div><div class="meta-row" id="wallet-line" style="display:none"><span class="meta-label">Wallet</span><span class="meta-value" id="wallet-addr">—</span></div></section>`
    }
    <section class="card" id="payment-status-box" style="display:none"></section>
    ${diagnosticsHtml()}
    <div class="action-bar">
      <button type="button" class="btn btn-primary ${inMiniPay ? '' : 'btn-disabled'}" id="confirm-pay-btn" ${inMiniPay ? '' : 'disabled'}>${payLabel}</button>
    </div>
  `

  document.getElementById('back-detail')?.addEventListener('click', () => setView('detail', { item }))

  const payBtn = document.getElementById('confirm-pay-btn')
  if (!inMiniPay || !payBtn) return

  payBtn.addEventListener('click', () => confirmMinipayPayment(session))
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

    setView('paid', { session: { ...session, txHash: data.tx_hash, explorerUrl: data.explorer_url } })
  } catch (err) {
    statusBox.innerHTML = `<div class="alert alert-error">${escapeHtml(String(err.message ?? err))}</div>`
    payBtn.disabled = false
  }
}

function renderPaid(main) {
  const session = state.checkoutSession
  main.innerHTML = `
    <section class="card">
      <h2 class="detail-title" style="font-size:17px;color:var(--accent)">Payment verified</h2>
      <p class="detail-desc">Your order is pending fulfillment. Thank you for shopping with Move+.</p>
      <div class="meta-row"><span class="meta-label">Product</span><span class="meta-value">${escapeHtml(session?.itemTitle || '—')}</span></div>
      <div class="meta-row"><span class="meta-label">Amount</span><span class="meta-value">${escapeHtml(session?.amountDisplay || '—')} ${escapeHtml(session?.tokenSymbol || '')}</span></div>
      ${
        session?.txHash
          ? `<div class="meta-row"><span class="meta-label">Tx</span><span class="meta-value">${session.explorerUrl ? `<a class="tx-link" href="${escapeHtml(session.explorerUrl)}" target="_blank" rel="noopener">${shortAddr(session.txHash)}</a>` : shortAddr(session.txHash)}</span></div>`
          : ''
      }
    </section>
    <button type="button" class="btn btn-primary" id="back-shop">Back to catalog</button>
    ${diagnosticsHtml()}
  `
  document.getElementById('back-shop')?.addEventListener('click', () => {
    state.checkoutSession = null
    state.selectedItem = null
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
      <div class="diagnostics-row"><span>rows returned</span><span class="diagnostics-value">${meta?.rowCount ?? '—'}</span></div>
      <div class="diagnostics-row"><span>first row stock_quantity</span><span class="diagnostics-value">${escapeHtml(String(meta?.firstRowStock ?? '—'))}</span></div>
      <div class="diagnostics-row"><span>first row is_available</span><span class="diagnostics-value">${escapeHtml(String(meta?.firstRowAvailable ?? '—'))}</span></div>
      <div class="diagnostics-row"><span>demo mode</span><span class="diagnostics-value">${meta?.demoMode ? 'on' : 'off'}</span></div>
      <div class="diagnostics-row"><span>checkout path</span><span class="diagnostics-value">${escapeHtml(`${window.location.origin}${window.location.pathname}`)}</span></div>
      <div class="diagnostics-row"><span>provider status</span><span class="diagnostics-value">${providerStatusLabel()}</span></div>
      <div class="diagnostics-row"><span>has window.ethereum</span><span class="diagnostics-value">${window.ethereum ? 'yes' : 'no'}</span></div>
      <div class="diagnostics-row"><span>isMiniPay</span><span class="diagnostics-value">${state.isMiniPay ? 'yes' : 'no'}</span></div>
      <div class="diagnostics-row"><span>session_id</span><span class="diagnostics-value">${state.checkoutSession?.sessionId ? 'present' : 'missing'}</span></div>
      <div class="diagnostics-row"><span>token</span><span class="diagnostics-value">${state.checkoutSession?.sessionToken ? 'present' : 'missing'}</span></div>
    </section>
  `
}

function render() {
  const main = document.getElementById('main')
  if (!main) return

  if (state.view === 'catalog') renderCatalog(main)
  else if (state.view === 'detail') renderDetail(main)
  else if (state.view === 'checkout') renderCheckout(main)
  else if (state.view === 'paid') renderPaid(main)
}

function boot() {
  initHeaderUi()
  syncWalletDetection()
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

function openExternalUrl(url) {
  window.open(url, '_blank', 'noopener,noreferrer')
}

function setOverlayVisible(visible) {
  const overlay = document.getElementById('ui-overlay')
  if (!overlay) return
  overlay.classList.toggle('hidden', !visible)
  overlay.setAttribute('aria-hidden', visible ? 'false' : 'true')
}

function closeAllHeaderOverlays() {
  state.ui.menuOpen = false
  state.ui.filterOpen = false
  closeMenuDrawer()
  closeFilterSheet()
  closeModal()
  setOverlayVisible(false)
}

function openModal({ title, body, primaryLabel, primaryAction, secondaryLabel, secondaryAction }) {
  const modal = document.getElementById('mp-modal')
  if (!modal) return
  modal.innerHTML = `
    <h2 class="modal-title">${escapeHtml(title)}</h2>
    <p class="modal-body">${escapeHtml(body)}</p>
    <div class="modal-actions">
      ${primaryLabel ? `<button type="button" class="btn btn-primary" id="mp-modal-primary">${escapeHtml(primaryLabel)}</button>` : ''}
      ${secondaryLabel ? `<button type="button" class="btn btn-secondary" id="mp-modal-secondary">${escapeHtml(secondaryLabel)}</button>` : ''}
    </div>
  `
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
      <button type="button" class="icon-button mp-icon-btn" id="menu-close" aria-label="Close menu">
        <svg class="icon-button-svg mp-icon-svg" viewBox="0 0 24 24" aria-hidden="true" fill="none">
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
      <li class="menu-item"><button type="button" class="menu-link" data-menu="support">Support</button></li>
      <li class="menu-item"><button type="button" class="menu-link" data-menu="delivery">Delivery Info</button></li>
      <li class="menu-item"><button type="button" class="menu-link" data-menu="open-app">Open Move+ App</button></li>
    </ul>
  `

  drawer.classList.remove('hidden')
  drawer.setAttribute('aria-hidden', 'false')
  updateOverlayState()

  document.getElementById('menu-close')?.addEventListener('click', closeMenuDrawer)
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
  const supportUrl = cfgUrl('supportUrl', 'https://')
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

  const sortOptions = [
    ['featured', 'Featured'],
    ['energy_low', 'Energy: low to high'],
    ['energy_high', 'Energy: high to low'],
    ['newest', 'Newest'],
  ]

  sheet.innerHTML = `
    <div class="sheet-handle" aria-hidden="true"></div>
    <h2 class="sheet-title" id="filter-sheet-title">Filter products</h2>
    <div class="filter-group">
      <span class="filter-label">Category</span>
      <div class="filter-options" id="filter-categories">
        ${CATEGORIES.map(
          (cat) =>
            `<button type="button" class="filter-option ${state.selectedCategory === cat ? 'active' : ''}" data-cat="${escapeHtml(cat)}">${escapeHtml(cat)}</button>`,
        ).join('')}
      </div>
    </div>
    <div class="filter-group">
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
    </div>
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
    const availBtn = sheet.querySelector('[data-avail].active')
    state.filters.availability = availBtn?.getAttribute('data-avail') || 'all'
    const sortBtn = sheet.querySelector('[data-sort].active')
    state.filters.sort = sortBtn?.getAttribute('data-sort') || 'featured'
    state.filters.energyMin = document.getElementById('filter-energy-min')?.value?.trim() ?? ''
    state.filters.energyMax = document.getElementById('filter-energy-max')?.value?.trim() ?? ''
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
  const btnOrders = document.getElementById('btn-orders')
  const btnClear = document.getElementById('btn-search-clear')
  const searchInput = document.getElementById('search-input')
  const overlay = document.getElementById('ui-overlay')

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

  btnOrders?.addEventListener('click', () => {
    closeMenuDrawer()
    closeFilterSheet()
    openTrackOrdersModal()
  })

  overlay?.addEventListener('click', () => {
    closeMenuDrawer()
    closeFilterSheet()
    closeModal()
  })
}

document.addEventListener('DOMContentLoaded', boot)
