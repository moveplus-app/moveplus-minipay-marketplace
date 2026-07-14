/** Shared MiniPay Energy reservation RPC helpers (verify-payment). */

export type EnergyReservationRpcResult = {
  ok: boolean
  error_code?: string
  status?: string
  reservation_id?: string
  energy_amount?: number
  idempotent?: boolean
}

export function parseEnergyReservationRpc(data: unknown): EnergyReservationRpcResult {
  if (!data || typeof data !== 'object') {
    return { ok: false, error_code: 'invalid_rpc_response' }
  }
  const row = data as Record<string, unknown>
  return {
    ok: row.ok === true,
    error_code: row.error_code != null ? String(row.error_code) : undefined,
    status: row.status != null ? String(row.status) : undefined,
    reservation_id: row.reservation_id != null ? String(row.reservation_id) : undefined,
    energy_amount: Number.isFinite(Number(row.energy_amount))
      ? Math.floor(Number(row.energy_amount))
      : undefined,
    idempotent: row.idempotent === true,
  }
}

export function mapEnergyDiscountStatusForClient(session: {
  energy_discount_status?: string | null
  energy_discount_energy?: number | null
  fulfillment_review_required?: boolean | null
}): string {
  if (session.fulfillment_review_required === true) return 'failed_review'
  const status = String(session.energy_discount_status ?? 'none').trim().toLowerCase()
  if (
    status === 'reserved' ||
    status === 'redeemed' ||
    status === 'released' ||
    status === 'failed' ||
    status === 'none'
  ) {
    if (status === 'failed') return 'failed_review'
    return status
  }
  const amount = Math.max(0, Math.floor(Number(session.energy_discount_energy ?? 0) || 0))
  return amount > 0 ? 'reserved' : 'none'
}
