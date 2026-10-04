/**
 * Verificación de RLS y RPCs contra el proyecto Supabase (usa la anon key pública).
 * Requiere que la base tenga las migraciones + seed.sql aplicados.
 *
 *   node scripts/verify-rls.mjs
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// ── Config: lee VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY de .env.local ──
const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    }),
)
const anon = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
})

const DEMO_RID = '00000000-0000-4000-8000-000000000001'
const BAR_RID = '00000000-0000-4000-8000-00000000f001'
const BAR_TORTILLA = '00000000-0000-4000-8000-00000000f041'
const BAR_CROQUETAS = '00000000-0000-4000-8000-00000000f042'
const BAR_PULPO_AGOTADO = '00000000-0000-4000-8000-00000000f043'
const BAR_OPT_MEDIA = '00000000-0000-4000-8000-00000000f061'
const BAR_OPT_ENTERA = '00000000-0000-4000-8000-00000000f062'
const DEMO_PIZZA_MUZZA = '00000000-0000-4000-8000-000000000405' // demo_uuid(4, 5)

let failed = 0
const results = []
async function check(name, fn) {
  try {
    const detail = await fn()
    results.push(`  ✔ ${name}${detail ? ` — ${detail}` : ''}`)
  } catch (e) {
    failed++
    results.push(`  ✘ ${name}\n      ${e.message ?? e}`)
  }
}
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg)
}
const rpc = async (fn, args) => {
  const { data, error } = await anon.rpc(fn, args)
  if (error) throw new Error(`${fn}: ${error.message}`)
  return data
}
const rpcError = async (fn, args) => {
  const { error } = await anon.rpc(fn, args)
  return error?.message ?? null
}

// ── 1. Lecturas públicas y aislamiento por tenant (anon) ──────────────────
await check('menú público legible (demo y privado)', async () => {
  const { data, error } = await anon.from('menu_items').select('restaurant_id').in('restaurant_id', [DEMO_RID, BAR_RID])
  assert(!error, error?.message)
  const demo = data.filter((r) => r.restaurant_id === DEMO_RID).length
  const bar = data.filter((r) => r.restaurant_id === BAR_RID).length
  assert(demo === 19 && bar === 3, `esperaba 19 demo + 3 privado, hay ${demo} + ${bar}`)
  return `${demo} platos demo, ${bar} privado`
})

await check('anon NO lee mesas del tenant privado (sí las del demo)', async () => {
  const { data, error } = await anon.from('tables').select('restaurant_id, token')
  assert(!error, error?.message)
  assert(data.every((t) => t.restaurant_id === DEMO_RID), 'se filtraron mesas privadas')
  assert(data.length === 12, `esperaba 12 mesas demo, hay ${data.length}`)
})

await check('anon NO lee pedidos ni alertas del tenant privado', async () => {
  const [{ data: o }, { data: a }, { data: s }] = await Promise.all([
    anon.from('orders').select('restaurant_id'),
    anon.from('alerts').select('restaurant_id'),
    anon.from('table_sessions').select('restaurant_id'),
  ])
  for (const rows of [o, a, s]) assert(rows.every((r) => r.restaurant_id === DEMO_RID), 'fuga de datos privados')
  return `${o.length} pedidos demo visibles`
})

await check('anon NO puede insertar en menu_items del tenant privado', async () => {
  const { error } = await anon.from('menu_items').insert({
    restaurant_id: BAR_RID,
    category_id: '00000000-0000-4000-8000-00000000f021',
    name: 'Hack',
    price: 1,
  })
  assert(error, 'el insert debió fallar por RLS')
})

await check('anon NO puede leer staff_invites', async () => {
  const { data, error } = await anon.from('staff_invites').select('code')
  assert(!error && data.length === 0, 'no debería ver invitaciones')
})

// ── 2. RPCs del cliente ────────────────────────────────────────────────────
await check('get_table_by_token devuelve restaurante + mesa', async () => {
  const d = await rpc('get_table_by_token', { p_token: 'prueba-mesa-01' })
  assert(d?.restaurant?.slug === 'bar-prueba', 'slug incorrecto')
  assert(d?.table?.number === 1, 'mesa incorrecta')
  assert(d?.restaurant?.is_demo === false, 'is_demo incorrecto')
})

await check('get_table_by_token con token inválido → null', async () => {
  const d = await rpc('get_table_by_token', { p_token: 'no-existe' })
  assert(d === null, `esperaba null, vino ${JSON.stringify(d)}`)
})

let sessionId, orderId
await check('place_order recalcula precios desde la DB e ignora precios del payload', async () => {
  const d = await rpc('place_order', {
    p_token: 'prueba-mesa-01',
    p_items: [
      { menu_item_id: BAR_TORTILLA, qty: 2, notes: 'sin cebolla', option_ids: [BAR_OPT_MEDIA], price: 1 },
      { menu_item_id: BAR_CROQUETAS, qty: 1, price: 1 },
    ],
  })
  // Tortilla 350000 - 100000 (Media) = 250000 × 2 = 500000; Croquetas 420000 → 920000
  assert(d.total === 920000, `total esperado 920000, vino ${d.total}`)
  sessionId = d.session_id
  orderId = d.order_id
  return `total ${d.total}`
})

await check('place_order rechaza un plato agotado hoy', async () => {
  const err = await rpcError('place_order', {
    p_token: 'prueba-mesa-01',
    p_items: [{ menu_item_id: BAR_PULPO_AGOTADO, qty: 1 }],
  })
  assert(err?.includes('ITEM_UNAVAILABLE'), `esperaba ITEM_UNAVAILABLE, vino ${err}`)
})

/**
 * El check de arriba usa un valor fijo del seed. Éste ejercita el camino completo en vivo
 * sobre el tenant demo (donde anon puede administrar): marcar agotado con la RPC, que
 * calcula el instante con la zona horaria del restaurante, y confirmar que place_order lo
 * rechaza. Es el que prueba el fix de la migración 20261004000100: antes, "agotado hoy" se
 * guardaba como fecha UTC y dejaba de valer a las 21:00 hora argentina, en plena cena.
 */
await check('set_item_sold_out marca hasta un instante futuro y place_order lo respeta', async () => {
  const until = await rpc('set_item_sold_out', { p_menu_item_id: DEMO_PIZZA_MUZZA, p_sold_out: true })
  try {
    assert(until !== null, 'esperaba un instante, vino null')
    const ms = new Date(until).getTime() - Date.now()
    assert(ms > 0, `el corte quedó en el pasado (${until})`)
    assert(ms < 32 * 60 * 60 * 1000, `el corte quedó demasiado lejos (${until})`)

    const err = await rpcError('place_order', {
      p_token: 'demo-mesa-01',
      p_items: [{ menu_item_id: DEMO_PIZZA_MUZZA, qty: 1 }],
    })
    assert(err?.includes('ITEM_UNAVAILABLE'), `esperaba ITEM_UNAVAILABLE, vino ${err}`)
  } finally {
    await rpc('set_item_sold_out', { p_menu_item_id: DEMO_PIZZA_MUZZA, p_sold_out: false })
  }

  // Al desmarcarlo deja de estar agotado. Puede seguir fallando por otra razón (este plato
  // tiene un grupo obligatorio), así que lo que importa es que YA NO sea ITEM_UNAVAILABLE.
  const ok = await rpcError('place_order', {
    p_token: 'demo-mesa-01',
    p_items: [{ menu_item_id: DEMO_PIZZA_MUZZA, qty: 1 }],
  })
  assert(!ok?.includes('ITEM_UNAVAILABLE'), `al desmarcarlo ya no debería estar agotado, vino ${ok}`)
})

await check('set_item_sold_out NO deja marcar un plato de un tenant privado', async () => {
  const err = await rpcError('set_item_sold_out', { p_menu_item_id: BAR_PULPO_AGOTADO, p_sold_out: false })
  assert(err?.includes('NOT_AUTHORIZED'), `esperaba NOT_AUTHORIZED, vino ${err}`)
})

await check('place_order exige el grupo obligatorio (Tamaño)', async () => {
  const err = await rpcError('place_order', {
    p_token: 'prueba-mesa-01',
    p_items: [{ menu_item_id: BAR_TORTILLA, qty: 1 }],
  })
  assert(err?.includes('OPTION_REQUIRED'), `esperaba OPTION_REQUIRED, vino ${err}`)
})

await check('place_order rechaza dos opciones en un grupo single', async () => {
  const err = await rpcError('place_order', {
    p_token: 'prueba-mesa-01',
    p_items: [{ menu_item_id: BAR_TORTILLA, qty: 1, option_ids: [BAR_OPT_MEDIA, BAR_OPT_ENTERA] }],
  })
  assert(err?.includes('OPTION_SINGLE'), `esperaba OPTION_SINGLE, vino ${err}`)
})

await check('place_order rechaza una opción de otro plato', async () => {
  const err = await rpcError('place_order', {
    p_token: 'prueba-mesa-01',
    p_items: [{ menu_item_id: BAR_CROQUETAS, qty: 1, option_ids: [BAR_OPT_MEDIA] }],
  })
  assert(err?.includes('OPTION_INVALID'), `esperaba OPTION_INVALID, vino ${err}`)
})

await check('place_order rechaza un plato de otro restaurante con el token de esta mesa', async () => {
  const err = await rpcError('place_order', {
    p_token: 'prueba-mesa-01',
    p_items: [{ menu_item_id: DEMO_PIZZA_MUZZA, qty: 1 }],
  })
  assert(err?.includes('ITEM_NOT_FOUND'), `esperaba ITEM_NOT_FOUND, vino ${err}`)
})

await check('place_order con carrito vacío / token inválido', async () => {
  assert((await rpcError('place_order', { p_token: 'prueba-mesa-01', p_items: [] }))?.includes('EMPTY_ORDER'), 'EMPTY_ORDER')
  assert((await rpcError('place_order', { p_token: 'xxx', p_items: [{ menu_item_id: BAR_CROQUETAS, qty: 1 }] }))?.includes('TABLE_NOT_FOUND'), 'TABLE_NOT_FOUND')
})

await check('create_alert es idempotente por (mesa, tipo) y marca bill_requested', async () => {
  const a = await rpc('create_alert', { p_token: 'prueba-mesa-01', p_type: 'bill' })
  const b = await rpc('create_alert', { p_token: 'prueba-mesa-01', p_type: 'bill' })
  assert(b.created === false && a.alert_id === b.alert_id, 'no fue idempotente')
  assert(a.session_id === sessionId, 'la alerta no se asoció a la sesión abierta')
})

await check('get_session_state devuelve el pedido, la alerta y el total', async () => {
  const s = await rpc('get_session_state', { p_session_id: sessionId })
  assert(s.session.status === 'bill_requested', `estado ${s.session.status}`)
  const mine = s.orders.find((o) => o.id === orderId)
  assert(mine, 'pedido faltante')
  assert(mine.status === 'pending', 'estado del pedido')
  assert(mine.total === 920000, `total del pedido ${mine.total}`)
  assert(mine.items.length === 2, 'ítems')
  assert(mine.items[0].selected_options[0].option_name === 'Media', 'opciones')
  assert(s.open_alerts.some((a) => a.type === 'bill'), 'alerta')
  assert(s.total >= 920000, `total de sesión ${s.total}`)
})

// ── 3. Escrituras del staff vs anon ───────────────────────────────────────
await check('anon NO puede cambiar el estado de un pedido privado', async () => {
  const { data, error } = await anon.from('orders').update({ status: 'kitchen' }).eq('id', orderId).select()
  assert(!error && data.length === 0, 'el update debió afectar 0 filas')
  const s = await rpc('get_session_state', { p_session_id: sessionId })
  assert(s.orders.find((o) => o.id === orderId).status === 'pending', 'el estado cambió')
})

await check('anon SÍ opera el tenant demo (mozo/cocina sin login) y los timestamps se sellan', async () => {
  const { data: pending } = await anon.from('orders').select('id').eq('restaurant_id', DEMO_RID).eq('status', 'pending')
  assert(pending.length === 1, `esperaba 1 pedido pendiente demo, hay ${pending.length}`)
  const { data, error } = await anon.from('orders').update({ status: 'kitchen' }).eq('id', pending[0].id).select('status, sent_to_kitchen_at')
  assert(!error && data.length === 1 && data[0].status === 'kitchen', error?.message ?? 'no actualizó')
  assert(data[0].sent_to_kitchen_at, 'sent_to_kitchen_at no se selló')
})

await check('reset_demo restaura el demo (3 pedidos activos, 1 alerta)', async () => {
  await rpc('reset_demo')
  const [{ data: o }, { data: a }] = await Promise.all([
    anon.from('orders').select('status').eq('restaurant_id', DEMO_RID),
    anon.from('alerts').select('id').eq('restaurant_id', DEMO_RID).is('resolved_at', null),
  ])
  const byStatus = Object.groupBy(o, (r) => r.status)
  assert(byStatus.pending?.length === 1 && byStatus.kitchen?.length === 2 && byStatus.delivered?.length === 1, JSON.stringify(byStatus))
  assert(a.length === 1, 'alertas')
})

await check('anon NO puede llamar seed_demo ni ensure_open_session', async () => {
  const e1 = await rpcError('seed_demo')
  const e2 = await rpcError('ensure_open_session', { p_restaurant_id: BAR_RID, p_table_id: '00000000-0000-4000-8000-00000000f031' })
  assert(e1 && e2, 'las funciones internas están expuestas')
})

await check('join_restaurant / create_restaurant exigen sesión', async () => {
  const e1 = await rpcError('join_restaurant', { p_code: 'ABC' })
  const e2 = await rpcError('create_restaurant', { p_name: 'X', p_slug: 'xxx' })
  assert(e1?.includes('NOT_AUTHENTICATED') && e2?.includes('NOT_AUTHENTICATED'), `${e1} / ${e2}`)
})

// Nota: la sesión del tenant privado queda abierta (anon no puede cerrarla; el staff lo hará en Fase 3).
// El script es re-ejecutable: las comprobaciones no dependen de ser la primera corrida.
console.log(results.join('\n'))
console.log(failed ? `\n${failed} verificación(es) fallaron` : '\nTodo OK')
process.exit(failed ? 1 : 0)
