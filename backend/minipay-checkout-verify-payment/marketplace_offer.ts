/**
 * Limited-time marketplace offer validation (Real Items / MiniPay).
 */

export type MarketplaceOfferRow = {
  is_limited_offer?: boolean | null
  offer_ends_at?: string | null
}

export function isLimitedOfferRow(row: MarketplaceOfferRow): boolean {
  return row.is_limited_offer === true
}

export function isOfferExpiredRow(
  row: MarketplaceOfferRow,
  now: Date = new Date(),
): boolean {
  if (!isLimitedOfferRow(row)) return false
  const raw = row.offer_ends_at
  if (!raw) return true
  const ends = new Date(raw)
  if (Number.isNaN(ends.getTime())) return true
  return now.getTime() >= ends.getTime()
}

export const OFFER_EXPIRED_ERROR = 'This offer has expired.'
