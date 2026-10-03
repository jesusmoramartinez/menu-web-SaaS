import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ClipboardList, SearchX, ShoppingBag, UtensilsCrossed } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { MenuSkeleton } from '@/components/ui/Skeleton'
import { useMenu, useSessionState } from '@/hooks/useQueries'
import { useToast } from '@/hooks/useToast'
import { toAppError } from '@/lib/errors'
import { formatPrice } from '@/lib/format'
import { qk } from '@/lib/queryKeys'
import { createAlert } from '@/services/alerts'
import type { AlertType, MenuItem } from '@/types/domain'
import { CartDrawer } from './CartDrawer'
import { ClientHeader } from './ClientHeader'
import { ItemOptionsSheet } from './ItemOptionsSheet'
import { MenuFilters, type CategoryFilter } from './MenuFilters'
import { MenuItemCard } from './MenuItemCard'
import { MyOrders } from './MyOrders'
import { ThanksScreen } from './ThanksScreen'
import { cartCount, cartTotal, type NewCartLine } from './cartReducer'
import { hasOptions } from './optionRules'
import { useClient } from './useClient'

type Tab = 'menu' | 'orders'

/** Minúsculas y sin acentos, para que "limon" encuentre "Limón". */
const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')

/** Una sesión cerrada hace más de 2 h se olvida sin mostrar la despedida. */
const CLOSED_GRACE_MS = 2 * 60 * 60_000

export default function ClientView() {
  const { token, table, sessionId, setSessionId, cart, dispatch } = useClient()
  const { restaurant } = table
  const currency = restaurant.currency
  const toast = useToast()
  const queryClient = useQueryClient()

  const [tab, setTab] = useState<Tab>('menu')
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [query, setQuery] = useState('')
  const [cartOpen, setCartOpen] = useState(false)
  const [configuring, setConfiguring] = useState<MenuItem | null>(null)

  const menu = useMenu(restaurant.id)
  const session = useSessionState(sessionId)
  const state = session.data

  // ── Sesión cerrada por el personal ─────────────────────────────────────
  const closed = state?.session.status === 'closed'
  const restart = async () => {
    await queryClient.refetchQueries({ queryKey: qk.tableByToken(token) })
    setSessionId(null)
    dispatch({ type: 'CLEAR' })
    setTab('menu')
  }
  useEffect(() => {
    if (!closed || !state?.session.closedAt) return
    if (Date.now() - new Date(state.session.closedAt).getTime() > CLOSED_GRACE_MS) void restart()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closed, state?.session.closedAt])

  // ── Llamar al mozo / pedir la cuenta ───────────────────────────────────
  const alert = useMutation({
    mutationFn: (type: AlertType) => createAlert(token, type),
    onSuccess: (result, type) => {
      setSessionId(result.sessionId)
      void queryClient.invalidateQueries({ queryKey: qk.session(result.sessionId) })
      toast.show(
        type === 'waiter'
          ? result.created
            ? 'Mozo en camino 🙋‍♂️'
            : 'Ya avisamos al mozo, está en camino'
          : result.created
            ? 'Cuenta solicitada 🧾'
            : 'La cuenta ya fue pedida',
        'info',
      )
    },
    onError: (err) => toast.show(toAppError(err).message, 'error'),
  })
  const waiterCalled = state?.openAlerts.some((a) => a.type === 'waiter') ?? false
  const billRequested = (state?.openAlerts.some((a) => a.type === 'bill') || state?.session.status === 'bill_requested') ?? false

  // ── Carrito ────────────────────────────────────────────────────────────
  const addLine = (line: NewCartLine) => {
    dispatch({ type: 'ADD', line })
    toast.show(`${line.name} agregado`)
    setConfiguring(null)
  }
  const handleAdd = (item: MenuItem) => {
    if (hasOptions(item)) setConfiguring(item)
    else addLine({ itemId: item.id, name: item.name, unitPrice: item.price, notes: '', optionIds: [], optionLabels: [] })
  }
  const inCartByItem = useMemo(() => {
    const m = new Map<string, number>()
    for (const l of cart.lines) m.set(l.itemId, (m.get(l.itemId) ?? 0) + l.qty)
    return m
  }, [cart.lines])
  const count = cartCount(cart)

  // ── Menú filtrado y agrupado ───────────────────────────────────────────
  const groups = useMemo(() => {
    if (!menu.data) return []
    const q = normalize(query.trim())
    const matches = menu.data.items.filter((item) => {
      const matchesCat = category === 'all' || item.categoryId === category
      const matchesQuery = !q || normalize(`${item.name} ${item.description} ${item.tags.join(' ')}`).includes(q)
      return matchesCat && matchesQuery
    })
    const cats = category === 'all' ? menu.data.categories : menu.data.categories.filter((c) => c.id === category)
    return cats.map((c) => ({ ...c, items: matches.filter((i) => i.categoryId === c.id) })).filter((g) => g.items.length > 0)
  }, [menu.data, category, query])

  const activeOrders = state?.orders.filter((o) => o.status !== 'cancelled' && o.status !== 'delivered').length ?? 0

  return (
    <div className="min-h-dvh pb-28">
      <ClientHeader
        restaurant={restaurant}
        table={table.table}
        waiterCalled={waiterCalled}
        billRequested={billRequested}
        busy={alert.isPending || closed}
        onCallWaiter={() => alert.mutate('waiter')}
        onRequestBill={() => alert.mutate('bill')}
      />

      {closed && state ? (
        <ThanksScreen restaurantName={restaurant.name} total={state.total} currency={currency} onRestart={() => void restart()} />
      ) : (
        <>
          <div className="sticky top-[var(--topbar-h,0px)] z-30 border-b border-stone-200 bg-stone-100/95 backdrop-blur">
            <div className="mx-auto max-w-client px-4 pt-3">
              <div className="flex gap-1 rounded-xl bg-stone-200/70 p-1" role="tablist" aria-label="Secciones">
                <TabButton active={tab === 'menu'} onClick={() => setTab('menu')} icon={<UtensilsCrossed size={16} />}>
                  Menú
                </TabButton>
                <TabButton active={tab === 'orders'} onClick={() => setTab('orders')} icon={<ClipboardList size={16} />} badge={activeOrders}>
                  Mis pedidos
                </TabButton>
              </div>
            </div>
            {tab === 'menu' && menu.data && (
              <MenuFilters categories={menu.data.categories} category={category} onCategory={setCategory} query={query} onQuery={setQuery} />
            )}
            {tab === 'menu' && !menu.data && <div className="h-3" />}
          </div>

          {tab === 'menu' ? (
            <main className="mx-auto max-w-client px-4 py-4">
              {menu.isPending ? (
                <MenuSkeleton />
              ) : menu.isError ? (
                <ErrorState error={menu.error} onRetry={() => menu.refetch()} title="No pudimos cargar el menú" />
              ) : groups.length === 0 ? (
                <EmptyState icon={SearchX} title="No encontramos platos" subtitle="Probá con otra búsqueda o categoría." />
              ) : (
                groups.map((g) => (
                  <section key={g.id} className="mb-6" aria-labelledby={`cat-${g.id}`}>
                    <h2 id={`cat-${g.id}`} className="mb-3 flex items-center gap-2 text-lg font-bold">
                      {g.emoji && <span aria-hidden="true">{g.emoji}</span>} {g.name}
                      <span className="text-sm font-normal text-stone-600">({g.items.length})</span>
                    </h2>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {g.items.map((item) => (
                        <MenuItemCard key={item.id} item={item} currency={currency} inCart={inCartByItem.get(item.id) ?? 0} onAdd={handleAdd} />
                      ))}
                    </div>
                  </section>
                ))
              )}
            </main>
          ) : (
            <MyOrders
              hasSession={!!sessionId}
              state={state}
              isPending={session.isPending && !!sessionId}
              error={session.error}
              currency={currency}
              billRequested={billRequested}
              onRetry={() => session.refetch()}
              onGoToMenu={() => setTab('menu')}
              onRequestBill={() => alert.mutate('bill')}
            />
          )}
        </>
      )}

      {count > 0 && !closed && (
        <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="mx-auto flex w-full max-w-client items-center justify-between rounded-2xl bg-stone-900 px-5 py-3.5 text-white shadow-2xl transition active:scale-[0.98] animate-slide-up"
          >
            <span className="flex items-center gap-3">
              <span className="relative">
                <ShoppingBag size={22} aria-hidden="true" />
                <span className="absolute -top-2 -right-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-500 px-1 text-[11px] font-bold">
                  {count}
                </span>
              </span>
              <span className="font-semibold">Ver pedido</span>
            </span>
            <span className="text-lg font-bold">{formatPrice(cartTotal(cart), currency)}</span>
          </button>
        </div>
      )}

      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} onOrdered={() => setTab('orders')} />
      {configuring && (
        <ItemOptionsSheet key={configuring.id} item={configuring} currency={currency} onClose={() => setConfiguring(null)} onAdd={addLine} />
      )}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  badge,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: ReactNode
  badge?: number
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition
        ${active ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
    >
      <span aria-hidden="true">{icon}</span>
      {children}
      {badge ? (
        <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-500 px-1 text-[11px] font-bold text-white">{badge}</span>
      ) : null}
    </button>
  )
}
