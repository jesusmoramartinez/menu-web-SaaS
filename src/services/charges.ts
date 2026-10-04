import { supabase } from '@/lib/supabase'
import type { ChargeMode, ServiceCharge } from '@/types/domain'

/**
 * Cargos fijos del restaurante (cubierto, servicio de mesa…).
 *
 * Dos capas distintas, a propósito:
 *  - el **catálogo** (`service_charges`) es lo que el restaurante PUEDE cobrar; lo edita
 *    owner/admin con CRUD directo, como el resto de `/admin`.
 *  - lo **aplicado a una mesa** (`session_charges`) lo decide el mozo mesa por mesa, y va
 *    por la RPC `set_session_charge`, que arma el snapshot leyendo el catálogo en el
 *    servidor. El navegador nunca manda importes, igual que con los precios en `place_order`.
 */

interface ChargeRow {
  id: string
  name: string
  mode: ChargeMode
  amount: number
  is_active: boolean
  suggested: boolean
  sort_order: number
}

const toCharge = (c: ChargeRow): ServiceCharge => ({
  id: c.id,
  name: c.name,
  mode: c.mode,
  amount: c.amount,
  isActive: c.is_active,
  suggested: c.suggested,
  sortOrder: c.sort_order,
})

export async function fetchServiceCharges(restaurantId: string): Promise<ServiceCharge[]> {
  const { data, error } = await supabase
    .from('service_charges')
    .select('id, name, mode, amount, is_active, suggested, sort_order')
    .eq('restaurant_id', restaurantId)
    .order('sort_order')
  if (error) throw error
  return (data as ChargeRow[]).map(toCharge)
}

export interface ServiceChargeInput {
  name: string
  mode: ChargeMode
  /** centavos en per_person/per_table; puntos básicos en percent (1000 = 10,00 %) */
  amount: number
  suggested: boolean
}

export async function createServiceCharge(restaurantId: string, input: ServiceChargeInput): Promise<void> {
  const { error } = await supabase.from('service_charges').insert({
    restaurant_id: restaurantId,
    name: input.name,
    mode: input.mode,
    amount: input.amount,
    suggested: input.suggested,
  })
  if (error) throw error
}

export async function updateServiceCharge(id: string, patch: Partial<ServiceChargeInput & { isActive: boolean }>): Promise<void> {
  const { error } = await supabase
    .from('service_charges')
    .update({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.mode !== undefined ? { mode: patch.mode } : {}),
      ...(patch.amount !== undefined ? { amount: patch.amount } : {}),
      ...(patch.suggested !== undefined ? { suggested: patch.suggested } : {}),
      ...(patch.isActive !== undefined ? { is_active: patch.isActive } : {}),
    })
    .eq('id', id)
  if (error) throw error
}

export async function deleteServiceCharge(id: string): Promise<void> {
  const { error } = await supabase.from('service_charges').delete().eq('id', id)
  if (error) throw error
}

// ── Lo aplicado a una mesa (mozo) ───────────────────────────────────────────

/** Qué cargos del catálogo están aplicados a esta sesión (ids del catálogo). */
export async function fetchSessionChargeIds(sessionId: string): Promise<string[]> {
  const { data, error } = await supabase.from('session_charges').select('charge_id').eq('session_id', sessionId)
  if (error) throw error
  return (data as { charge_id: string | null }[]).map((r) => r.charge_id).filter((id): id is string => id !== null)
}

/** Aplica o saca un cargo de una mesa. El importe lo congela el servidor. */
export async function setSessionCharge(sessionId: string, chargeId: string, applied: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_session_charge', {
    p_session_id: sessionId,
    p_charge_id: chargeId,
    p_applied: applied,
  })
  if (error) throw error
}

/** Cuántos comensales hay en la mesa: el cubierto por persona se calcula con esto. */
export async function setSessionGuests(sessionId: string, guests: number | null): Promise<void> {
  const { error } = await supabase.from('table_sessions').update({ guests }).eq('id', sessionId)
  if (error) throw error
}

/**
 * Ajuste sobre la cuenta de una mesa (se rompió algo, un descuento…). El motivo es
 * obligatorio. Los importes **negativos** sólo los acepta la base para owner/admin: la
 * regla vive en la política RLS, porque depende del rol de quien escribe.
 */
export async function addSessionAdjustment(
  restaurantId: string,
  sessionId: string,
  amount: number,
  reason: string,
): Promise<void> {
  const { error } = await supabase
    .from('session_adjustments')
    .insert({ restaurant_id: restaurantId, session_id: sessionId, amount, reason })
  if (error) throw error
}
