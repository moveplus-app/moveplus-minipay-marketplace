/**
 * Digital Gear preview entry for MiniPay Web Marketplace.
 * Display-only collections:
 *   - Ronin Genesis #1–#100 (digital-gear-genesis.js)
 *   - Base Founder Gear #1–#100 (digital-gear-base.js)
 *
 * Season 1 / Shoebox are not included. No purchase/signing in MiniPay.
 */
;(function () {
  const PLACEHOLDER = './assets/gear/gear_placeholder.png'

  function buildCatalog() {
    const out = []

    if (
      window.MovePlusGenesisGear &&
      typeof window.MovePlusGenesisGear.buildGenesisCatalog === 'function'
    ) {
      out.push(...window.MovePlusGenesisGear.buildGenesisCatalog())
    }

    if (
      window.MovePlusBaseFounderGear &&
      typeof window.MovePlusBaseFounderGear.buildBaseFounderCatalog === 'function'
    ) {
      out.push(...window.MovePlusBaseFounderGear.buildBaseFounderCatalog())
    }

    // Fail-safe: never invent Season/Shoebox stubs here.
    return out
  }

  window.MOVEPLUS_DIGITAL_GEAR_PREVIEW = buildCatalog()
  window.MOVEPLUS_DIGITAL_GEAR_PLACEHOLDER = PLACEHOLDER

  window.MOVEPLUS_DIGITAL_GEAR = {
    rebuild() {
      window.MOVEPLUS_DIGITAL_GEAR_PREVIEW = buildCatalog()
      return window.MOVEPLUS_DIGITAL_GEAR_PREVIEW
    },
    placeholder: PLACEHOLDER,
  }
})()
