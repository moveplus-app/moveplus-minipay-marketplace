/** Shared MiniPay Energy reservation RPC helpers (create-session). */

export type EnergyReservationRpcResult = {
  ok: boolean
  error_code?: string
  status?: string
  reservation_id?: string
  energy_amount?: number
  idempotent?: boolean
  balance?: number
  required?: number
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
    balance: Number.isFinite(Number(row.balance))
      ? Math.floor(Number(row.balance))
      : undefined,
    required: Number.isFinite(Number(row.required))
      ? Math.floor(Number(row.required))
      : undefined,
  }
}

export const ENERGY_BALANCE_CHANGED_ERROR =
  'Energy balance changed. Please refresh and try again.'
