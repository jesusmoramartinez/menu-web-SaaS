import { supabase } from '@/lib/supabase'
import type {
  OrderStatus,
  SelectedOption,
  SessionOrder,
  SessionState,
  StaffOrder,
  StaffOrderItem,
} from '@/types/domain'

// ── Comensal ───────────────────────────────────────────────────────────────

/** Línea tal como la espera place_order (snake_case, sin precios: los pone el servidor). */
export type PlaceOrderLine = {
  menu_item_id: string
  qty: number
  notes: string
  option_ids: string[]
}

export interface PlaceOrderResult {
  orderId: string
  sessionId: string
  total: number
}

export async function placeOrder(token: string, items: PlaceOrderLine[]): Promise<PlaceOrderResult> {
  const { data, error } = await supabase.rpc('place_order', { p_token: token, p_items: items })
  if (error) throw error
  const d = data as unknown as { order_id: string; session_id: string; total: number }
  return { orderId: d.order_id, sessionId: d.session_id, total: d.total }
}

interface RawSelectedOption {
  group_name: string
  option_name: string
  price_delta: number
}

export const toSelectedOptions = (raw: unknown): SelectedOption[] =>
  Array.isArray(raw)
    ? (raw as RawSelectedOption[]).map((o) => ({
        groupName: o.group_name,
        optionName: o.option_name,
        priceDelta: o.price_delta,
      }))
    : []

interface SessionStatePayload {
  session: { id: string; status: SessionState['session']['status']; opened_at: string; closed_at: string | null }
  table: { id: string; number: number; label: string | null }
  orders: {
    id: string
    status: OrderStatus
    total: number
    created_at: string
    sent_to_kitchen_at: string | null
    ready_at: string | null
    delivered_at: string | null
    items: {
      id: string
      name: string
      qty: number
      unit_price: number
      line_total: number
      notes: string
      selected_options: unknown
    }[]
  }[]
  open_alerts: { id: string; type: SessionState['openAlerts'][number]['type']; created_at: string }[]
  subtotal: number
  charges: { id: string; name: string; amount: number }[]
  adjustments: { id: string; amount: number; reason: string; created_at: string }[]
  total: number
}

/** Estado completo de la sesión del comensal. Devuelve null si la sesión no existe. */
export async function fetchSessionState(sessionId: string): Promise<SessionState | null> {
  const { data, error } = await supabase.rpc('get_session_state', { p_session_id: sessionId })
  if (error) throw error
  if (!data) return null
  const p = data as unknown as SessionStatePayload
  const orders: SessionOrder[] = p.orders.map((o) => ({
    id: o.id,
    status: o.status,
    total: o.total,
    createdAt: o.created_at,
    sentToKitchenAt: o.sent_to_kitchen_at,
    readyAt: o.ready_at,
    deliveredAt: o.delivered_at,
    items: o.items.map((i) => ({
      id: i.id,
      name: i.name,
      qty: i.qty,
      unitPrice: i.unit_price,
      lineTotal: i.line_total,
      notes: i.notes,
      selectedOptions: toSelectedOptions(i.selected_options),
    })),
  }))
  return {
    session: { id: p.session.id, status: p.session.status, openedAt: p.session.opened_at, closedAt: p.session.closed_at },
    table: p.table,
    orders,
    openAlerts: p.open_alerts.map((a) => ({ id: a.id, type: a.type, createdAt: a.created_at })),
    subtotal: p.subtotal,
    charges: p.charges ?? [],
    adjustments: (p.adjustments ?? []).map((a) => ({ id: a.id, amount: a.amount, reason: a.reason, createdAt: a.created_at })),
    total: p.total,
  }
}

// ── Staff (mozo / cocina) ──────────────────────────────────────────────────

const ACTIVE_STATUSES: OrderStatus[] = ['pending', 'kitchen', 'ready']

const ORDER_SELECT =
  'id, table_id, session_id, status, total, created_at, sent_to_kitchen_at, ready_at, delivered_at, ' +
  'tables(number, label, sector_id), ' +
  'order_items(id, menu_item_id, name_snapshot, unit_price_snapshot, qty, notes, line_total, selected_options, sort_order)'

interface StaffOrderRow {
  id: string
  table_id: string
  session_id: string
  status: OrderStatus
  total: number
  created_at: string
  sent_to_kitchen_at: string | null
  ready_at: string | null
  delivered_at: string | null
  tables: { number: number; label: string | null; sector_id: string | null } | null
  order_items: {
    id: string
    menu_item_id: string | null
    name_snapshot: string
    unit_price_snapshot: number
    qty: number
    notes: string
    line_total: number | null
    selected_options: unknown
    sort_order: number
  }[]
}

const toStaffOrder = (o: StaffOrderRow): StaffOrder => ({
  id: o.id,
  tableId: o.table_id,
  tableNumber: o.tables?.number ?? 0,
  tableLabel: o.tables?.label ?? null,
  sectorId: o.tables?.sector_id ?? null,
  sessionId: o.session_id,
  status: o.status,
  total: o.total,
  createdAt: o.created_at,
  sentToKitchenAt: o.sent_to_kitchen_at,
  readyAt: o.ready_at,
  deliveredAt: o.delivered_at,
  items: [...o.order_items]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map<StaffOrderItem>((i) => ({
      id: i.id,
      menuItemId: i.menu_item_id,
      name: i.name_snapshot,
      unitPrice: i.unit_price_snapshot,
      qty: i.qty,
      notes: i.notes,
      lineTotal: i.line_total ?? i.unit_price_snapshot * i.qty,
      selectedOptions: toSelectedOptions(i.selected_options),
    })),
})

/** Pedidos vivos del restaurante (pending, kitchen, ready), del más viejo al más nuevo. */
export async function fetchActiveOrders(restaurantId: string): Promise<StaffOrder[]> {
  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_SELECT)
    .eq('restaurant_id', restaurantId)
    .in('status', ACTIVE_STATUSES)
    .order('created_at')
  if (error) throw error
  return (data as unknown as StaffOrderRow[]).map(toStaffOrder)
}

export async function updateOrderStatus(orderId: string, status: OrderStatus): Promise<void> {
  const { data, error } = await supabase.from('orders').update({ status }).eq('id', orderId).select('id')
  if (error) throw error
  if (!data?.length) throw new Error('No se pudo actualizar el pedido (¿sin permisos?)')
}

export interface OrderItemEdit {
  id: string
  qty: number
  notes: string
}

/**
 * Edición del mozo: actualiza cantidad/notas de las líneas indicadas y elimina el resto.
 * El total del pedido lo recalcula un trigger en la base.
 */
export async function updateOrderItems(orderId: string, keep: OrderItemEdit[], removeIds: string[]): Promise<void> {
  const ops: PromiseLike<{ error: unknown }>[] = keep.map((l) =>
    supabase.from('order_items').update({ qty: l.qty, notes: l.notes }).eq('id', l.id).eq('order_id', orderId),
  )
  if (removeIds.length) {
    ops.push(supabase.from('order_items').delete().in('id', removeIds).eq('order_id', orderId))
  }
  const results = await Promise.all(ops)
  const failed = results.find((r) => r.error)
  if (failed) throw failed.error
}
