/**
 * Safe account summary for web marketplace (read-only).
 * Never returns phone, wallets, activity history, JWT, or raw token IDs.
 */

import { createClient } from 'https://'

export type SafeAccountSummary = {
  linked: true
  display_label: string
  energy_balance: number
  digital_gear_count: number
  ronin_gear_count: number
  base_gear_count: number
  primary_gear_label: string | null
}

const GENESIS_CONTRACT =
  (Deno.env.get('GENESIS_NFT_CONTRACT_ADDRESS') ??
    '0x5f1').toLowerCase()

function maskEmail(email: string): string {
  const trimmed = email.trim().toLowerCase()
  const at = trimmed.indexOf('@')
  if (at <= 0) return 'Move+ Member'
  const local = trimmed.slice(0, at)
  const domain = trimmed.slice(at + 1)
  if (!domain) return 'Move+ Member'
  const head = local.slice(0, 1) || '*'
  return `${head}***@${domain}`
}

function buildDisplayLabel(name: string | null | undefined, email: string | null | undefined): string {
  const n = typeof name === 'string' ? name.trim() : ''
  if (n.length >= 2) return n.slice(0, 40)
  if (typeof email === 'string' && email.includes('@')) return maskEmail(email)
  return 'Move+ Member'
}

function stripTokenSuffix(label: string): string {
  return label.replace(/\s*#\d+\s*$/u, '').trim()
}

function roninPrimaryLabel(row: {
  nft_type?: string | null
  contract_address?: string | null
  rarity?: string | null
}): string {
  const type = String(row.nft_type ?? '').toLowerCase()
  if (type === 'shoebox') return 'Shoebox'
  const contract = String(row.contract_address ?? '').toLowerCase()
  if (contract === GENESIS_CONTRACT) return 'Genesis Gear'
  const rarity = String(row.rarity ?? '').trim()
  if (rarity) {
    const pretty = rarity.charAt(0).toUpperCase() + rarity.slice(1).toLowerCase()
    return `${pretty} Season Gear`
  }
  return 'Ronin Gear'
}

function basePrimaryLabel(row: { name?: string | null; rarity?: string | null }): string {
  const raw = stripTokenSuffix(String(row.name ?? '').trim())
  if (raw.length >= 2 && !/^\d+$/.test(raw)) return raw.slice(0, 48)
  const rarity = String(row.rarity ?? '').trim()
  if (rarity) return `Base ${rarity} Gear`.slice(0, 48)
  return 'Base Founder Gear'
}

export async function loadSafeAccountSummary(
  admin: ReturnType<typeof createClient>,
  userId: string,
): Promise<SafeAccountSummary> {
  const { data: profile } = await admin
    .from('users')
    .select('name, email, energy_points')
    .eq('id', userId)
    .maybeSingle()

  const energyBalance = Math.max(
    0,
    Math.floor(Number(profile?.energy_points ?? 0) || 0),
  )
  const displayLabel = buildDisplayLabel(
    profile?.name as string | undefined,
    profile?.email as string | undefined,
  )

  const { data: roninRows } = await admin
    .from('user_nfts')
    .select('is_active, is_deprecated, nft_type, contract_address, rarity')
    .eq('user_id', userId)

  const roninActive = (roninRows ?? []).filter((r) => r.is_deprecated !== true)
  const roninCount = roninActive.length
  const roninEquipped = roninActive.find((r) => r.is_active === true) ?? null

  const { data: baseRows } = await admin
    .from('user_base_nfts')
    .select('is_active, name, rarity')
    .eq('user_id', userId)

  const baseList = baseRows ?? []
  const baseCount = baseList.length
  const baseEquipped = baseList.find((r) => r.is_active === true) ?? null

  let primary: string | null = null
  if (roninEquipped) primary = roninPrimaryLabel(roninEquipped)
  else if (baseEquipped) primary = basePrimaryLabel(baseEquipped)

  return {
    linked: true,
    display_label: displayLabel,
    energy_balance: energyBalance,
    digital_gear_count: roninCount + baseCount,
    ronin_gear_count: roninCount,
    base_gear_count: baseCount,
    primary_gear_label: primary,
  }
}
