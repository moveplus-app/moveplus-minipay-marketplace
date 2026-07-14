/**
 * Unit tests for MiniPay Energy reservation RPC response parsing.
 * Run: deno test --allow-env supabase/functions/minipay-checkout-verify-payment/energy_reservation_test.ts
 */
import { assertEquals } from 'https://'
import {
  mapEnergyDiscountStatusForClient,
  parseEnergyReservationRpc,
} from './energy_reservation.ts'

Deno.test('parseEnergyReservationRpc accepts ok payload', () => {
  const parsed = parseEnergyReservationRpc({
    ok: true,
    status: 'redeemed',
    reservation_id: 'aaaa',
    energy_amount: 25,
    idempotent: true,
  })
  assertEquals(parsed.ok, true)
  assertEquals(parsed.status, 'redeemed')
  assertEquals(parsed.reservation_id, 'aaaa')
  assertEquals(parsed.energy_amount, 25)
  assertEquals(parsed.idempotent, true)
})

Deno.test('parseEnergyReservationRpc rejects invalid payload', () => {
  assertEquals(parseEnergyReservationRpc(null).ok, false)
  assertEquals(parseEnergyReservationRpc('x').error_code, 'invalid_rpc_response')
  assertEquals(parseEnergyReservationRpc({ ok: false, error_code: 'insufficient_balance' }).ok, false)
})

Deno.test('mapEnergyDiscountStatusForClient maps review + statuses', () => {
  assertEquals(
    mapEnergyDiscountStatusForClient({ fulfillment_review_required: true }),
    'failed_review',
  )
  assertEquals(
    mapEnergyDiscountStatusForClient({ energy_discount_status: 'failed' }),
    'failed_review',
  )
  assertEquals(
    mapEnergyDiscountStatusForClient({ energy_discount_status: 'reserved' }),
    'reserved',
  )
  assertEquals(
    mapEnergyDiscountStatusForClient({ energy_discount_status: 'redeemed' }),
    'redeemed',
  )
  assertEquals(
    mapEnergyDiscountStatusForClient({ energy_discount_status: 'released' }),
    'released',
  )
  assertEquals(
    mapEnergyDiscountStatusForClient({ energy_discount_status: 'none' }),
    'none',
  )
})
