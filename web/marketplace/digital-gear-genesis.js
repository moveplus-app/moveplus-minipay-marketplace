/**
 * MiniPay Digital Gear — Ronin Genesis #1–#100 (display-only).
 * Deterministic design/rarity/art matching web/moveplus-marketplace genesis-ipfs.js
 * and Flutter getDeterministicNftDesign / getDeterministicNftRarity.
 *
 * No wallet connect, Waypoint, signing, Buy, or cart.
 */
;(function () {
  const GENESIS_FIRST = 1
  const GENESIS_LAST = 100
  const DESIGNS = ['design_a', 'design_b', 'design_c', 'design_d', 'design_e']
  const GENESIS_CONTRACT = ''
  const LOCAL_BASE = './assets/genesi_nft_shoes/genesis'
  const PLACEHOLDER = './assets/gear/gear_placeholder.png'
  const DEFAULT_IPFS_CID =
    ''
  const GATEWAYS = [
    'https://gateway./',
    'https://cloudflare/',
    'https://ipfs.io/ipfs/',
  ]

  function cfg() {
    return window.MP_MARKETPLACE_CONFIG || window.MOVEPLUS_MARKETPLACE_CONFIG || {}
  }

  function clampTokenId(tokenId) {
    const id = Math.floor(Number(tokenId))
    if (!Number.isFinite(id) || id < GENESIS_FIRST) return GENESIS_FIRST
    if (id > GENESIS_LAST) return GENESIS_LAST
    return id
  }

  function getGenesisDesign(tokenId) {
    const id = clampTokenId(tokenId)
    return DESIGNS[(id - 1) % 5]
  }

  function getGenesisRarity(tokenId) {
    const id = clampTokenId(tokenId)
    if (id <= 60) return 'rare'
    if (id <= 90) return 'epic'
    return 'legendary'
  }

  function getGenesisRarityLabel(tokenId) {
    const r = getGenesisRarity(tokenId)
    if (r === 'epic') return 'Epic'
    if (r === 'legendary') return 'Legendary'
    return 'Rare'
  }

  function getGenesisDesignLabel(tokenId) {
    const d = getGenesisDesign(tokenId)
    const letter = d.replace('design_', '').toUpperCase()
    return `Design ${letter}`
  }

  function getGenesisLocalImage(tokenId) {
    const design = getGenesisDesign(tokenId)
    const rarity = getGenesisRarity(tokenId)
    return `${LOCAL_BASE}/${design}/${rarity}.png`
  }

  function ipfsCidFromConfig() {
    const c = cfg()
    const prefix = String(c.genesisImgPrefix || c.GENESIS_IMG_PREFIX || '').trim()
    if (prefix) {
      const m = prefix.match(/\/ipfs\/([^/?#]+)/)
      if (m) return m[1]
    }
    const cid = String(c.genesisImgCid || c.GENESIS_IMG_CID || DEFAULT_IPFS_CID).trim()
    return cid || DEFAULT_IPFS_CID
  }

  function getGenesisRemoteCandidates(tokenId) {
    const design = getGenesisDesign(tokenId)
    const rarity = getGenesisRarity(tokenId)
    const rel = `${design}/${rarity}.png`
    const cid = ipfsCidFromConfig()
    if (!cid) return []
    const c = cfg()
    const prefix = String(c.genesisImgPrefix || c.GENESIS_IMG_PREFIX || '')
      .trim()
      .replace(/\/+$/, '')
    const urls = []
    if (prefix && prefix.includes('/ipfs/')) {
      urls.push(`${prefix}/${rel}`)
    }
    for (const g of GATEWAYS) {
      const u = `${g}${cid}/${rel}`
      if (urls.indexOf(u) === -1) urls.push(u)
    }
    return urls
  }

  /**
   * Image candidate order.
   * Default: local first (mobile-safe), then IPFS gateways, then placeholder.
   * Set genesisPreferRemoteImages=true to try IPFS first.
   */
  function getGenesisImageCandidates(tokenId) {
    const c = cfg()
    const preferRemote =
      c.genesisPreferRemoteImages === true || c.GENESIS_PREFER_REMOTE_IMAGES === true
    const local = getGenesisLocalImage(tokenId)
    const remotes = getGenesisRemoteCandidates(tokenId)
    const ordered = preferRemote ? [...remotes, local] : [local, ...remotes]
    ordered.push(PLACEHOLDER)
    // de-dupe
    const seen = {}
    return ordered.filter((u) => {
      if (!u || seen[u]) return false
      seen[u] = true
      return true
    })
  }

  function wireImageFallback(imgEl, tokenId) {
    if (!imgEl) return
    const urls = getGenesisImageCandidates(tokenId)
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

  function roninExplorerUrl(tokenId) {
    const id = clampTokenId(tokenId)
    const c = cfg()
    const base = String(c.roninNftExplorerBase || '').trim().replace(/\/+$/, '')
    if (base) return `${base}/${GENESIS_CONTRACT}/${id}`
    return `https://app.roninchain.com/nft/${GENESIS_CONTRACT}/${id}`
  }

  function buildGenesisCatalogItem(tokenId) {
    const id = clampTokenId(tokenId)
    const design = getGenesisDesign(id)
    const rarity = getGenesisRarity(id)
    const rarityLabel = getGenesisRarityLabel(id)
    const designLabel = getGenesisDesignLabel(id)
    const localImage = getGenesisLocalImage(id)
    const candidates = getGenesisImageCandidates(id)
    return {
      id: `ronin-genesis-${id}`,
      tokenId: id,
      title: `Genesis #${id}`,
      description:
        'Limited Ronin Genesis Digital Gear. Preview only — purchase and manage inside Move+.',
      chain: 'Ronin',
      gearType: 'Genesis',
      category: 'Genesis',
      filterChain: 'Ronin',
      filterCategory: 'Genesis',
      collection: 'Move+ Genesis',
      rarity: rarityLabel,
      rarityKey: rarity,
      design,
      designLabel,
      previewOnly: true,
      isGenesis: true,
      imageUrl: candidates[0] || localImage,
      fallbackImageUrl: localImage,
      imageCandidates: candidates,
      cidImageUrl: getGenesisRemoteCandidates(id)[0] || null,
      explorerUrl: roninExplorerUrl(id),
      dailyCap: null,
      multiplier: null,
      repairDiscount: null,
    }
  }

  function buildGenesisCatalog() {
    const out = []
    for (let id = GENESIS_FIRST; id <= GENESIS_LAST; id += 1) {
      out.push(buildGenesisCatalogItem(id))
    }
    return out
  }

  window.MovePlusGenesisGear = {
    GENESIS_FIRST,
    GENESIS_LAST,
    GENESIS_CONTRACT,
    PLACEHOLDER,
    getGenesisDesign,
    getGenesisRarity,
    getGenesisRarityLabel,
    getGenesisDesignLabel,
    getGenesisLocalImage,
    getGenesisRemoteCandidates,
    getGenesisImageCandidates,
    wireImageFallback,
    buildGenesisCatalogItem,
    buildGenesisCatalog,
    roninExplorerUrl,
  }
})()
