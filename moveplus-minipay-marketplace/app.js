const ERC20_TRANSFER_SELECTOR = '0xa9059cbb'

const DEBUG = new URLSearchParams(window.location.search).has('debug')

function qs(name) {
  return new URLSearchParams(window.location.search).get(name)?.trim() ?? ''
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

function isMiniPayWallet() {
  return Boolean(window.ethereum && window.ethereum.isMiniPay)
}

function logDebug(...args) {
  if (DEBUG) console.log('[minipay-checkout]', ...args)
}

function friendlyFetchError(err) {
  const msg = String(err?.message ?? err)
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) {
    return 'Could not load checkout session. Please reopen from Move+ or try again.'
  }
  return 'Something went wrong. Please reopen from Move+ or try again.'
}

function friendlyApiError(status, data) {
  if (data?.error && typeof data.error === 'string') return data.error
  if (status === 403) return 'Invalid checkout link. Please reopen checkout from Move+.'
  if (status === 404) return 'Checkout session not found. Please reopen checkout from Move+.'
  if (status === 410 || data?.status === 'expired') {
    return 'Checkout session expired. Please create a new MiniPay checkout from Move+.'
  }
  if (status === 503) return 'MiniPay checkout is temporarily unavailable. Please try again later.'
  return 'Could not load checkout session. Please reopen from Move+ or try again.'
}

async function invokeVerify(body) {
  const cfg = window.MOVEPLUS_MINIPAY_CONFIG
  if (!cfg?.supabaseUrl || !cfg?.supabaseAnonKey) {
    throw new Error('MiniPay checkout is not configured on this page.')
  }
  const fn = cfg.verifyFunctionName || 'minipay-checkout-verify-payment'
  const url = `${cfg.supabaseUrl}/functions/v1/${fn}`

  let res
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: cfg.supabaseAnonKey,
        Authorization: `Bearer ${cfg.supabaseAnonKey}`,
      },
      body: JSON.stringify(body),
    })
  } catch (err) {
    logDebug('fetch failed', err)
    throw new Error(friendlyFetchError(err))
  }

  const data = await res.json().catch(() => ({}))
  logDebug('verify response', { status: res.status, data })
  return { status: res.status, data }
}

function render(root, html) {
  root.innerHTML = html
}

function errorCard(message, { retry = false } = {}) {
  const retryBtn = retry
    ? `<button id="retry-btn" class="btn btn-secondary" type="button" style="margin-top:12px">Retry</button>`
    : ''
  return `
    <section class="card">
      <div class="alert alert-error">${message}</div>
      ${retryBtn}
    </section>
  `
}

function summaryCard(session) {
  return `
    <section class="card">
      <div class="row"><span class="label">Product</span><span class="value">${session.item_title ?? 'Item'}</span></div>
      <div class="row"><span class="label">Amount</span><span class="value">${session.amount_display ?? '—'}</span></div>
      <div class="row"><span class="label">Token</span><span class="value">${session.token_symbol ?? '—'}</span></div>
      <div class="row"><span class="label">Network</span><span class="value">Celo (${session.chain_id ?? '—'})</span></div>
      <div class="row"><span class="label">Delivery</span><span class="value">Philippines only</span></div>
    </section>
  `
}

function howToContinueCard() {
  return `
    <section class="card instructions-card">
      <h2 class="instructions-title">How to continue</h2>
      <ol class="instructions-list">
        <li>Open MiniPay.</li>
        <li>Open this checkout link inside MiniPay.</li>
        <li>Tap <strong>Pay with MiniPay</strong>.</li>
        <li>Confirm the payment in MiniPay.</li>
        <li>Return to Move+ and tap <strong>Check Payment Status</strong>.</li>
      </ol>
      <p class="muted instructions-note">Payment confirmation appears only inside MiniPay.</p>
    </section>
  `
}

async function ensureChain(chainId) {
  const hex = chainIdHex(chainId)
  const current = await window.ethereum.request({ method: 'eth_chainId' })
  if (current?.toLowerCase() === hex.toLowerCase()) return
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: hex }],
    })
  } catch (e) {
    throw new Error('Wrong network. Switch to Celo in MiniPay.')
  }
}

function bindRetry(loadFn) {
  const retryBtn = document.getElementById('retry-btn')
  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      loadFn()
    })
  }
}

async function loadCheckout() {
  const root = document.getElementById('app-root')
  const sessionId = qs('session_id')
  const token = qs('token')

  if (!sessionId || !token) {
    render(
      root,
      errorCard('Invalid checkout link. Please reopen checkout from Move+.'),
    )
    return
  }

  render(root, `<section class="card loading"><p>Loading checkout…</p></section>`)

  let status
  let data
  try {
    ;({ status, data } = await invokeVerify({
      session_id: sessionId,
      session_token: token,
    }))
  } catch (err) {
    render(root, errorCard(String(err.message ?? err), { retry: true }))
    bindRetry(loadCheckout)
    return
  }

  if (status === 410 || data.status === 'expired') {
    render(
      root,
      errorCard(
        'Checkout session expired. Please create a new MiniPay checkout from Move+.',
      ),
    )
    return
  }

  if (status === 403 || status === 404 || !data.success) {
    render(root, errorCard(friendlyApiError(status, data)))
    return
  }

  if (data.status === 'paid') {
    render(
      root,
      `
      ${summaryCard(data)}
      <section class="card">
        <span class="status-pill">Paid</span>
        <p style="margin-top:12px">Payment verified. Your order is pending fulfillment.</p>
        <div class="row"><span class="label">Payment</span><span class="value">MiniPay · ${data.token_symbol ?? 'cUSD'}</span></div>
        <div class="row"><span class="label">Chain</span><span class="value">Celo</span></div>
        ${data.tx_hash ? `<div class="row"><span class="label">Tx</span><span class="value"><a class="tx-link" href="${data.explorer_url ?? '#'}" target="_blank" rel="noopener">${shortAddr(data.tx_hash)}</a></span></div>` : ''}
      </section>
    `,
    )
    return
  }

  renderPendingCheckout(root, { sessionId, token, data })
}

function renderPendingCheckout(root, { sessionId, token, data }) {
  const isMiniPay = isMiniPayWallet()
  const payButtonLabel = isMiniPay ? 'Pay with MiniPay' : 'Open inside MiniPay'
  let payer = null

  render(
    root,
    `
    ${summaryCard(data)}
    <section class="card">
      <div class="row"><span class="label">Status</span><span class="value"><span class="status-pill ${isMiniPay ? '' : 'warn'}">${data.status ?? 'pending'}</span></span></div>
      ${
        !isMiniPay
          ? `<div class="alert alert-warn">MiniPay wallet not detected. Open this checkout inside MiniPay to continue.</div>
             <p class="muted helper-text">Payment confirmation appears only inside MiniPay.</p>`
          : `<div class="alert alert-info">MiniPay detected. Tap below to connect and confirm payment.</div>`
      }
      <div id="wallet-line" class="row" style="display:none"><span class="label">Wallet</span><span class="value" id="wallet-addr">—</span></div>
      <button id="pay-btn" class="btn btn-primary${isMiniPay ? '' : ' btn-disabled'}" type="button"${isMiniPay ? '' : ' disabled'}>${payButtonLabel}</button>
      <p class="muted" style="margin-top:12px">Do not share your seed phrase. Move+ never asks for it.</p>
    </section>
    ${!isMiniPay ? howToContinueCard() : ''}
    <section class="card" id="status-box" style="display:none"></section>
  `,
  )

  const payBtn = document.getElementById('pay-btn')
  const statusBox = document.getElementById('status-box')
  const walletLine = document.getElementById('wallet-line')
  const walletAddrEl = document.getElementById('wallet-addr')

  if (!payBtn) return

  if (!isMiniPay) {
    payBtn.disabled = true
    payBtn.setAttribute('aria-disabled', 'true')
    return
  }

  payBtn.disabled = false
  payBtn.removeAttribute('aria-disabled')

  payBtn.addEventListener('click', async () => {
    if (!isMiniPayWallet()) {
      statusBox.style.display = 'block'
      statusBox.innerHTML = `<div class="alert alert-warn">MiniPay wallet not detected. Open this checkout inside MiniPay to continue.</div>`
      return
    }

    payBtn.disabled = true
    statusBox.style.display = 'block'
    statusBox.innerHTML = `<div class="alert alert-info">Connecting wallet…</div>`

    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
      payer = normalizeAddr(accounts?.[0])
      if (!payer) throw new Error('No wallet address returned')

      walletLine.style.display = 'flex'
      walletAddrEl.textContent = shortAddr(payer)

      await ensureChain(data.chain_id)

      const transferData = encodeErc20Transfer(data.treasury_address, data.amount_raw)
      const txParams = {
        from: payer,
        to: normalizeAddr(data.token_address),
        data: transferData,
        value: '0x0',
      }

      statusBox.innerHTML = `<div class="alert alert-info">Confirm payment in MiniPay…</div>`

      const txHash = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [txParams],
      })

      statusBox.innerHTML = `<div class="alert alert-info">Transaction submitted. Verifying…</div>`

      const verify = await invokeVerify({
        session_id: sessionId,
        session_token: token,
        tx_hash: txHash,
        payer_wallet_address: payer,
      })

      if (verify.data.success && verify.data.status === 'paid') {
        statusBox.innerHTML = `
          <span class="status-pill">Paid</span>
          <p style="margin-top:12px">Payment verified. Return to Move+ and tap Check Payment Status.</p>
          <div class="row"><span class="label">Payment</span><span class="value">MiniPay · ${verify.data.token_symbol}</span></div>
          <div class="row"><span class="label">Chain</span><span class="value">Celo</span></div>
          <div class="row"><span class="label">Tx</span><span class="value">${shortAddr(verify.data.tx_hash)}</span></div>
        `
        payBtn.style.display = 'none'
        return
      }

      throw new Error(verify.data.error ?? 'Verification failed')
    } catch (err) {
      const msg = String(err?.message ?? err)
      let friendly = msg
      if (/failed to fetch|networkerror|load failed/i.test(msg)) {
        friendly = 'Could not verify payment. Please try again or check status in Move+.'
      } else if (/user rejected|denied|cancel/i.test(msg)) {
        friendly = 'Payment cancelled in wallet.'
      } else if (/insufficient/i.test(msg)) {
        friendly = 'Insufficient funds for this payment.'
      }
      statusBox.innerHTML = `<div class="alert alert-error">${friendly}</div>`
      payBtn.disabled = false
    }
  })
}

function main() {
  return loadCheckout()
}

main().catch((e) => {
  logDebug('unhandled', e)
  const root = document.getElementById('app-root')
  const message = friendlyFetchError(e)
  render(root, errorCard(message, { retry: true }))
  bindRetry(() => main())
})
