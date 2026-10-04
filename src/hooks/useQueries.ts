import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { qk } from '@/lib/queryKeys'
import { fetchOpenAlerts } from '@/services/alerts'
import { fetchServiceCharges, fetchSessionChargeIds } from '@/services/charges'
import { fetchMenu } from '@/services/menu'
import { fetchActiveOrders, fetchSessionState } from '@/services/orders'
import { subscribeToRestaurant } from '@/services/realtime'
import { fetchRestaurantBySlug } from '@/services/restaurants'
import { fetchMyAssignments, fetchMyStaff } from '@/services/staff'
import { fetchTableByToken, fetchTablesOverview } from '@/services/tables'

/** Restaurante por slug (público). `data === null` cuando no existe. */
export function useRestaurantBySlug(slug: string) {
  return useQuery({ queryKey: qk.restaurantBySlug(slug), queryFn: () => fetchRestaurantBySlug(slug), staleTime: 5 * 60_000 })
}

/** Contexto de la mesa desde el token del QR. `data === null` cuando el token no existe. */
export function useTableByToken(token: string) {
  return useQuery({ queryKey: qk.tableByToken(token), queryFn: () => fetchTableByToken(token), staleTime: 60_000 })
}

export function useMenu(restaurantId: string) {
  return useQuery({ queryKey: qk.menu(restaurantId), queryFn: () => fetchMenu(restaurantId), staleTime: 60_000 })
}

/**
 * Estado de la sesión del comensal. Sin realtime para anónimos: se refresca cada
 * `intervalMs` mientras la sesión esté abierta y al volver a la pestaña.
 */
export function useSessionState(sessionId: string | null, intervalMs = 8_000) {
  return useQuery({
    queryKey: qk.session(sessionId ?? 'none'),
    queryFn: () => fetchSessionState(sessionId as string),
    enabled: !!sessionId,
    refetchInterval: (query) => {
      const data = query.state.data
      // sesión inexistente (null) o cerrada: no tiene sentido seguir consultando
      if (data === null || data?.session.status === 'closed') return false
      return intervalMs
    },
    // el comensal puede tener la pestaña "oculta" (pantalla dividida, navegador embebido): seguir consultando
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  })
}

// ── Staff ──────────────────────────────────────────────────────────────────

export function useActiveOrders(restaurantId: string) {
  return useQuery({
    queryKey: qk.activeOrders(restaurantId),
    queryFn: () => fetchActiveOrders(restaurantId),
    refetchInterval: 15_000, // respaldo por si realtime se cae
  })
}

export function useOpenAlerts(restaurantId: string) {
  return useQuery({
    queryKey: qk.openAlerts(restaurantId),
    queryFn: () => fetchOpenAlerts(restaurantId),
    refetchInterval: 15_000,
  })
}

export function useTablesOverview(restaurantId: string) {
  return useQuery({
    queryKey: qk.tablesOverview(restaurantId),
    queryFn: () => fetchTablesOverview(restaurantId),
    refetchInterval: 15_000,
  })
}

/** Catálogo de cargos fijos del restaurante (cubierto, servicio de mesa…). */
export function useServiceCharges(restaurantId: string) {
  return useQuery({
    queryKey: qk.serviceCharges(restaurantId),
    queryFn: () => fetchServiceCharges(restaurantId),
  })
}

/** Qué cargos del catálogo están aplicados a una mesa (ids del catálogo). */
export function useSessionChargeIds(sessionId: string | null) {
  return useQuery({
    queryKey: qk.sessionCharges(sessionId ?? 'none'),
    queryFn: () => fetchSessionChargeIds(sessionId as string),
    enabled: !!sessionId,
  })
}

/** Asignación de sectores/mesas del mozo autenticado. `undefined` staffId (demo) = consulta apagada. */
export function useMyAssignments(staffId: string | null) {
  return useQuery({
    queryKey: qk.myAssignments(staffId ?? 'none'),
    queryFn: () => fetchMyAssignments(staffId as string),
    enabled: !!staffId,
  })
}

// ── Auth ─────────────────────────────────────────────────────────────────

/** Fila de staff (+ restaurante) del usuario autenticado. `null` = todavía no se unió a ningún restaurante. */
export function useMyStaff(userId: string | null) {
  return useQuery({
    queryKey: qk.myStaff(userId ?? 'none'),
    queryFn: () => fetchMyStaff(userId as string),
    enabled: !!userId,
    staleTime: 60_000,
  })
}

/** Invalida las queries del restaurante cuando llega un cambio por realtime. */
export function useRealtimeInvalidation(restaurantId: string | undefined) {
  const queryClient = useQueryClient()
  useEffect(() => {
    if (!restaurantId) return
    return subscribeToRestaurant(restaurantId, (table) => {
      if (table === 'menu_items') {
        void queryClient.invalidateQueries({ queryKey: qk.menu(restaurantId) })
      } else {
        void queryClient.invalidateQueries({ queryKey: qk.staff(restaurantId) })
      }
    })
  }, [restaurantId, queryClient])
}
