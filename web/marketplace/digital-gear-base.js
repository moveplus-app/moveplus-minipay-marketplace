/**
 * MiniPay Digital Gear — Base Founder Gear #1–#100 (display-only).
 * Deterministic designs match Flutter base_founder_gear_assets.dart:
 *   design = ((tokenId - 1) % 10) + 1 → design_1.png … design_10.png
 *
 * App truth: 1.8x multiplier. No 2.2x / 23%. No sale, wallet, or transfer.
 */
;(function () {
  const FOUNDER_FIRST = 1
  const FOUNDER_LAST = 100
  const DESIGN_COUNT = 10
  const MULTIPLIER_LABEL = '1.8x'
  const LOCAL_BASE = './assets/founder_gear'
  const PLACEHOLDER = './assets/gear/gear_placeholder.png'

  function cfg() {
    return window.MP_MARKETPLACE_CONFIG || window.MOVEPLUS_MARKETPLACE_CONFIG || {}
  }

  function clampTokenId(tokenId) {
    const id = Math.floor(Number(tokenId))
    if (!Number.isFinite(id) || id < FOUNDER_FIRST) return FOUNDER_FIRST
    if (id > FOUNDER_LAST) return FOUNDER_LAST
    return id
  }

  function getBaseFounderDesign(tokenId) {
    const id = clampTokenId(tokenId)
    return ((id - 1) % DESIGN_COUNT) + 1
  }

  function getBaseFounderDesignLabel(tokenId) {
    return `Design ${getBaseFounderDesign(tokenId)}`
  }

  function getBaseFounderLocalImage(tokenId) {
    const designNumber = getBaseFounderDesign(tokenId)
    return `${LOCAL_BASE}/design_${designNumber}.png`
  }

  /** Optional remote overrides later — currently unused. */
  function getBaseFounderRemoteCandidates(_tokenId) {
    const c = cfg()
    const prefix = String(c.baseFounderImgPrefix || c.BASE_FOUNDER_IMG_PREFIX || '')
      .trim()
      .replace(/\/+$/, '')
    if (!prefix) return []
    const designNumber = getBaseFounderDesign(_tokenId)
    return [`${prefix}/design_${designNumber}.png`]
  }

  /**
   * Local → optional remote → placeholder. Never leave a broken icon.
   */
  function getBaseFounderImageCandidates(tokenId) {
    const local = getBaseFounderLocalImage(tokenId)
    const remotes = getBaseFounderRemoteCandidates(tokenId)
    const ordered = [local, ...remotes, PLACEHOLDER]
    const seen = {}
    return ordered.filter((u) => {
      if (!u || seen[u]) return false
      seen[u] = true
      return true
    })
  }

  function wireBaseImageFallback(imgEl, tokenId) {
    if (!imgEl) return
    const urls = getBaseFounderImageCandidates(tokenId)
    if (!urls.length) return
    let i = 0
    try {
      imgEl.referrerPolicy = 'no-referrer'
    } catch (_) {
      /* ignore */
    }
    imgEl.loading = imgEl.loading || 'lazy'
    imgEl.decoding = 'async'
    imgEl.onerror = function () {
      i += 1
      if (i < urls.length) {
        imgEl.src = urls[i]
      } else {
        imgEl.onerror = null
        imgEl.classList.add('gear-image--failed')
        const wrap = imgEl.closest('.product-image-wrap, .detail-hero')
        const block = wrap && wrap.querySelector('.gear-image-fallback')
        if (block) block.classList.remove('hidden')
      }
    }
    imgEl.src = urls[0]
  }

  function normalizeContractAddress(raw) {
    const addr = String(raw || '').trim().toLowerCase()
    if (!/^0x[a-f0-9]{40}$/.test(addr)) return null
    return addr
  }

  function baseFounderContractAddress() {
    const c = cfg()
    return normalizeContractAddress(
      c.baseFounderGearContractAddress || c.BASE_FOUNDER_GEAR_CONTRACT_ADDRESS || '',
    )
  }

  /** BaseScan NFT URL only when a public contract address is configured. */
  function baseScanUrl(tokenId) {
    const contract = baseFounderContractAddress()
    if (!contract) return null
    const id = clampTokenId(tokenId)
    const c = cfg()
    const base = String(c.baseNftExplorerBase || '')
      .trim()
      .replace(/\/+$/, '')
    if (base) return `${base}/${contract}/${id}`
    return `https://basescan.org/nft/${contract}/${id}`
  }

  function buildBaseFounderCatalogItem(tokenId) {
    const id = clampTokenId(tokenId)
    const designNumber = getBaseFounderDesign(id)
    const designLabel = getBaseFounderDesignLabel(id)
    const localImage = getBaseFounderLocalImage(id)
    const candidates = getBaseFounderImageCandidates(id)
    const explorerUrl = baseScanUrl(id)
    return {
      id: `base-founder-${id}`,
      tokenId: id,
      title: `Base Founder Gear #${id}`,
      description:
        'Base Founder Gear preview. 100 total supply. Purchase and management are available inside Move+.',
      chain: 'Base',
      gearType: 'Founder',
      category: 'Founder',
      filterChain: 'Base',
      filterCategory: 'Founder',
      collection: 'Base Founder Gear',
      badge: 'FOUNDER',
      rarity: 'FOUNDER',
      rarityKey: 'founder',
      design: `design_${designNumber}`,
      designNumber,
      designLabel,
      multiplier: MULTIPLIER_LABEL,
      supplyNote: '100 total supply',
      previewOnly: true,
      isGenesis: false,
      isBaseFounder: true,
      imageUrl: candidates[0] || localImage,
      fallbackImageUrl: localImage,
      imageCandidates: candidates,
      cidImageUrl: null,
      explorerUrl,
      dailyCap: null,
      repairDiscount: null,
    }
  }

  function buildBaseFounderCatalog() {
    const out = []
    for (let id = FOUNDER_FIRST; id <= FOUNDER_LAST; id += 1) {
      out.push(buildBaseFounderCatalogItem(id))
    }
    return out
  }

  window.MovePlusBaseFounderGear = {
    FOUNDER_FIRST,
    FOUNDER_LAST,
    DESIGN_COUNT,
    MULTIPLIER_LABEL,
    PLACEHOLDER,
    getBaseFounderDesign,
    getBaseFounderDesignLabel,
    getBaseFounderLocalImage,
    getBaseFounderRemoteCandidates,
    getBaseFounderImageCandidates,
    wireBaseImageFallback,
    buildBaseFounderCatalogItem,
    buildBaseFounderCatalog,
    baseFounderContractAddress,
    baseScanUrl,
  }
})()
