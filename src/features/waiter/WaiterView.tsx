import { BellRing, ChefHat, ClipboardList, Inbox, Pencil, Table2, Truck } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { CardsSkeleton } from '@/components/ui/Skeleton'
import { SoundToggle } from '@/components/ui/SoundToggle'
import { useRestaurantScope } from '@/features/staff/useRestaurantScope'
import { useActiveOrders, useMyAssignments, useOpenAlerts, useTablesOverview } from '@/hooks/useQueries'
import { useNewItemsAlert } from '@/hooks/useNewItemsAlert'
import { useSoundPreference } from '@/hooks/useSoundPreference'
import { useStaffMutations } from '@/hooks/useStaffMutations'
import { useToast } from '@/hooks/useToast'
import { useNow } from '@/lib/useNow'
import type { StaffOrder, WaiterAssignment } from '@/types/domain'
import { AlertsPanel } from './AlertsPanel'
import { filterByAssignment, hasAssignments } from './assignmentFilter'
import { OrderCard } from './OrderCard'
import { OrderEditModal } from './OrderEditModal'
import { TablesOverview } from './TablesOverview'

type Tab = 'pedidos' | 'mesas'

/** Referencia estable: evita que `?? []` invalide los useMemo de abajo en cada render. */
const NO_ASSIGNMENTS: WaiterAssignment[] = []

export default function WaiterView() {
  const { restaurant, staffId } = useRestaurantScope()
  const orders = useActiveOrders(restaurant.id)
  const alerts = useOpenAlerts(restaurant.id)
  const assignments = useMyAssignments(staffId)
  const tables = useTablesOverview(restaurant.id)
  const { setStatus, resolve, closeSession } = useStaffMutations(restaurant.id)
  const toast = useToast()
  const sound = useSoundPreference()
  const [tab, setTab] = useState<Tab>('pedidos')
  const [editing, setEditing] = useState<StaffOrder | null>(null)
  const [showAll, setShowAll] = useState(false)
  const now = useNow(10_000)
  const currency = restaurant.currency

  const myAssignments = assignments.data ?? NO_ASSIGNMENTS
  const assigned = hasAssignments(myAssignments)

  const visibleOrders = useMemo(() => filterByAssignment(orders.data ?? [], myAssignments, showAll), [orders.data, myAssignments, showAll])
  const visibleAlerts = useMemo(() => filterByAssignment(alerts.data ?? [], myAssignments, showAll), [alerts.data, myAssignments, showAll])

  const pending = visibleOrders.filter((o) => o.status === 'pending')
  const ready = visibleOrders.filter((o) => o.status === 'ready')
  const inKitchen = visibleOrders.filter((o) => o.status === 'kitchen')

  // Avisa (sonido + vibración) cuando llega una alerta o un pedido nuevo por revisar.
  useNewItemsAlert(
    useMemo(() => [...visibleAlerts.map((a) => a.id), ...pending.map((o) => o.id)], [visibleAlerts, pending]),
    sound.enabled,
  )

  const sendToKitchen = (orderId: string) =>
    setStatus.mutate({ orderId, status: 'kitchen' }, { onSuccess: () => toast.show('Comanda enviada a cocina 👨‍🍳') })
  const markDelivered = (orderId: string) =>
    setStatus.mutate({ orderId, status: 'delivered' }, { onSuccess: () => toast.show('Pedido entregado ✅') })
  const handleCloseTable = (sessionId: string) =>
    closeSession.mutate(sessionId, { onSuccess: () => toast.show('Mesa cerrada', 'info') })

  return (
    <div className="min-h-dvh">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-staff items-start justify-between px-4 py-4">
          <div>
            <h1 className="text-xl font-bold">Panel del Mozo</h1>
            <p className="text-sm text-stone-500">{restaurant.name} · llamados de mesa y comandas</p>
          </div>
          <SoundToggle enabled={sound.enabled} onToggle={sound.toggle} />
        </div>
        <div className="mx-auto max-w-staff px-4 pb-3">
          <div className="flex gap-1 rounded-xl bg-stone-200/70 p-1" role="tablist" aria-label="Secciones">
            <TabButton active={tab === 'pedidos'} onClick={() => setTab('pedidos')} icon={<Inbox size={16} />}>
              Pedidos
            </TabButton>
            <TabButton active={tab === 'mesas'} onClick={() => setTab('mesas')} icon={<Table2 size={16} />}>
              Mesas
            </TabButton>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-staff space-y-8 px-4 py-5">
        {assigned && (
          <label className="flex items-center justify-end gap-2 text-sm text-stone-600">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="h-4 w-4 accent-brand-500" />
            Ver todas las mesas (no sólo las mías)
          </label>
        )}

        {tab === 'pedidos' ? (
          <>
            {alerts.isError ? (
              <ErrorState error={alerts.error} onRetry={() => alerts.refetch()} title="No pudimos cargar las alertas" />
            ) : (
              <AlertsPanel alerts={visibleAlerts} now={now} onResolve={(id) => resolve.mutate(id)} resolving={resolve.isPending} />
            )}

            <Section id="pending" icon={<Inbox size={18} className="text-amber-500" aria-hidden="true" />} title="Pedidos entrantes" count={pending.length} tone="bg-amber-500">
              {orders.isPending ? (
                <CardsSkeleton />
              ) : orders.isError ? (
                <ErrorState error={orders.error} onRetry={() => orders.refetch()} title="No pudimos cargar las comandas" />
              ) : pending.length === 0 ? (
                <EmptyState icon={Inbox} title="No hay comandas por revisar" subtitle="Cuando una mesa confirme un pedido, aparecerá aquí." />
              ) : (
                <Grid>
                  {pending.map((o) => (
                    <OrderCard
                      key={o.id}
                      order={o}
                      now={now}
                      currency={currency}
                      actions={
                        <>
                          <Button variant="secondary" size="sm" icon={<Pencil size={14} />} onClick={() => setEditing(o)}>
                            Editar
                          </Button>
                          <Button variant="success" size="sm" icon={<ChefHat size={14} />} onClick={() => sendToKitchen(o.id)} disabled={setStatus.isPending}>
                            A cocina
                          </Button>
                        </>
                      }
                    />
                  ))}
                </Grid>
              )}
            </Section>

            {ready.length > 0 && (
              <Section id="ready" icon={<BellRing size={18} className="text-emerald-600" aria-hidden="true" />} title="Listos para entregar" count={ready.length} tone="bg-emerald-600">
                <Grid>
                  {ready.map((o) => (
                    <OrderCard
                      key={o.id}
                      order={o}
                      now={now}
                      currency={currency}
                      actions={
                        <Button variant="success" size="sm" icon={<Truck size={14} />} onClick={() => markDelivered(o.id)} disabled={setStatus.isPending}>
                          Entregado
                        </Button>
                      }
                    />
                  ))}
                </Grid>
              </Section>
            )}

            {inKitchen.length > 0 && (
              <Section id="kitchen" icon={<ClipboardList size={18} aria-hidden="true" />} title="En cocina" count={inKitchen.length} tone="bg-sky-600" muted>
                <Grid className="opacity-80">
                  {inKitchen.map((o) => (
                    <OrderCard key={o.id} order={o} now={now} currency={currency} />
                  ))}
                </Grid>
              </Section>
            )}
          </>
        ) : tables.isPending ? (
          <CardsSkeleton count={4} />
        ) : tables.isError ? (
          <ErrorState error={tables.error} onRetry={() => tables.refetch()} title="No pudimos cargar las mesas" />
        ) : (
          <TablesOverview
            tables={filterByAssignment(
              (tables.data ?? []).map((t) => ({ ...t, tableId: t.id })),
              myAssignments,
              showAll,
            )}
            currency={currency}
            now={now}
            onClose={handleCloseTable}
            closing={closeSession.isPending}
          />
        )}
      </main>

      {editing && (
        <OrderEditModal key={editing.id} order={editing} restaurantId={restaurant.id} currency={currency} onClose={() => setEditing(null)} />
      )}
    </div>
  )
}

function TabButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: ReactNode; children: ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
        active ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'
      }`}
    >
      <span aria-hidden="true">{icon}</span>
      {children}
    </button>
  )
}

function Section({
  id,
  icon,
  title,
  count,
  tone,
  muted,
  children,
}: {
  id: string
  icon: ReactNode
  title: string
  count: number
  tone: string
  muted?: boolean
  children: ReactNode
}) {
  return (
    <section aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className={`mb-3 flex items-center gap-2 text-lg font-bold ${muted ? 'text-stone-600' : ''}`}>
        {icon} {title}
        {count > 0 && <span className={`rounded-full ${tone} px-2 py-0.5 text-xs font-bold text-white`}>{count}</span>}
      </h2>
      {children}
    </section>
  )
}

function Grid({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-3 ${className}`}>{children}</div>
}
