import { supabase } from '@/lib/supabase'
import type { SessionStatus, TableContext, TableOverview } from '@/types/domain'
import { toRestaurant, type RestaurantRowLike } from './restaurants'

interface TableByTokenPayload {
  restaurant: RestaurantRowLike
  table: { id: string; number: number; label: string | null; sector: string | null }
  session: { id: string; status: SessionStatus; opened_at: string } | null
}

/** Contexto de la mesa a partir del token del QR. Devuelve null si el token no existe. */
export async function fetchTableByToken(token: string): Promise<TableContext | null> {
  const { data, error } = await supabase.rpc('get_table_by_token', { p_token: token })
  if (error) throw error
  if (!data) return null
  const p = data as unknown as TableByTokenPayload
  return {
    restaurant: toRestaurant(p.restaurant),
    table: { id: p.table.id, number: p.table.number, label: p.table.label, sector: p.table.sector },
    session: p.session ? { id: p.session.id, status: p.session.status, openedAt: p.session.opened_at } : null,
  }
}

interface TableOverviewRow {
  id: string
  number: number
  label: string | null
  sector_id: string | null
  sector_name: string | null
  session_id: string | null
  session_status: SessionStatus | null
  opened_at: string | null
  guests: number | null
  total: number
  can_close: boolean
}

/**
 * Panorama de mesas para la pestaña "Mesas" del mozo: todas las mesas del
 * restaurante con su sector, si tienen sesión abierta, el total acumulado y
 * si se pueden cerrar (sin pedidos pending/kitchen/ready).
 *
 * Lo calcula la base (`get_tables_overview`) y vuelve una fila por mesa. Antes se
 * armaba acá descargando **todos** los pedidos no cancelados del restaurante, sin
 * ventana temporal, cada 15 segundos: a los pocos meses eran miles de filas por
 * refresco en el teléfono del mozo.
 */
export async function fetchTablesOverview(restaurantId: string): Promise<TableOverview[]> {
  const { data, error } = await supabase.rpc('get_tables_overview', { p_restaurant_id: restaurantId })
  if (error) throw error
  return (data as unknown as TableOverviewRow[]).map((t) => ({
    id: t.id,
    number: t.number,
    label: t.label,
    sectorId: t.sector_id,
    sectorName: t.sector_name,
    sessionId: t.session_id,
    sessionStatus: t.session_status,
    openedAt: t.opened_at,
    guests: t.guests,
    total: t.total,
    canClose: t.can_close,
  }))
}

export async function closeTableSession(sessionId: string): Promise<void> {
  const { error } = await supabase.rpc('close_table_session', { p_session_id: sessionId })
  if (error) throw error
}
