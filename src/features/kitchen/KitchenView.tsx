import { CheckCircle2, ChefHat, Flame, Maximize, Minimize, type LucideIcon } from 'lucide-react'
import { useMemo } from 'react'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { CardsSkeleton } from '@/components/ui/Skeleton'
import { SoundToggle } from '@/components/ui/SoundToggle'
import { useRestaurantScope } from '@/features/staff/useRestaurantScope'
import { useActiveOrders } from '@/hooks/useQueries'
import { useFullscreen } from '@/hooks/useFullscreen'
import { useNewItemsAlert } from '@/hooks/useNewItemsAlert'
import { useSoundPreference } from '@/hooks/useSoundPreference'
import { useStaffMutations } from '@/hooks/useStaffMutations'
import { useToast } from '@/hooks/useToast'
import { useNow } from '@/lib/useNow'
import { useWakeLock } from '@/hooks/useWakeLock'
import { KitchenTicket } from './KitchenTicket'

export default function KitchenView() {
  const { restaurant } = useRestaurantScope()
  const orders = useActiveOrders(restaurant.id)
  const { setStatus } = useStaffMutations(restaurant.id)
  const toast = useToast()
  const sound = useSoundPreference()
  const fullscreen = useFullscreen()
  const now = useNow(5_000) // la cocina necesita el reloj más preciso

  // La pantalla de cocina suele quedar fija en una tablet: no dejamos que se apague sola.
  useWakeLock(true)

  const inKitchen = (orders.data?.filter((o) => o.status === 'kitchen') ?? []).sort(
    (a, b) => new Date(a.sentToKitchenAt ?? a.createdAt).getTime() - new Date(b.sentToKitchenAt ?? b.createdAt).getTime(),
  )
  const readyCount = orders.data?.filter((o) => o.status === 'ready').length ?? 0
  const plates = inKitchen.reduce((s, o) => s + o.items.reduce((a, i) => a + i.qty, 0), 0)

  // Avisa (sonido + vibración) cuando entra una comanda nueva a cocina.
  useNewItemsAlert(
    useMemo(() => inKitchen.map((o) => o.id), [inKitchen]),
    sound.enabled,
  )

  const markReady = (orderId: string) =>
    setStatus.mutate({ orderId, status: 'ready' }, { onSuccess: () => toast.show('Comanda lista ✅ el mozo ya la ve') })

  return (
    <div className="min-h-dvh bg-stone-200">
      <header className="bg-stone-900 text-white">
        <div className="mx-auto flex max-w-kds flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-500">
              <ChefHat size={24} aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-xl font-bold whitespace-nowrap">Pantalla de Cocina</h1>
              <p className="text-xs text-stone-300">KDS · {restaurant.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex gap-5 text-right">
              <Stat icon={Flame} value={inKitchen.length} label="comandas" />
              <Stat value={plates} label="platos" />
              <Stat icon={CheckCircle2} value={readyCount} label="por entregar" muted />
            </div>
            <div className="flex gap-1 border-l border-stone-700 pl-4">
              <SoundToggle enabled={sound.enabled} onToggle={sound.toggle} dark />
              {fullscreen.supported && (
                <button
                  type="button"
                  onClick={fullscreen.toggle}
                  title={fullscreen.isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
                  aria-label={fullscreen.isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
                  className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-stone-300 transition hover:bg-stone-800 hover:text-white"
                >
                  {fullscreen.isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-kds px-4 py-5">
        <div className="mb-4 flex items-center gap-4 text-xs font-medium text-stone-600" aria-label="Leyenda de urgencia">
          <Legend color="bg-emerald-600" label="< 8 min" />
          <Legend color="bg-amber-500" label="8 – 15 min" />
          <Legend color="bg-red-500" label="> 15 min" />
        </div>

        {orders.isPending ? (
          <CardsSkeleton count={4} />
        ) : orders.isError ? (
          <ErrorState error={orders.error} onRetry={() => orders.refetch()} title="No pudimos cargar las comandas" />
        ) : inKitchen.length === 0 ? (
          <EmptyState icon={ChefHat} title="Sin comandas en cocina" subtitle="Cuando el mozo apruebe un pedido, aparecerá aquí." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {inKitchen.map((o, idx) => (
              <KitchenTicket key={o.id} order={o} now={now} index={idx} onReady={() => markReady(o.id)} busy={setStatus.isPending} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

function Stat({ icon: Icon, value, label, muted }: { icon?: LucideIcon; value: number; label: string; muted?: boolean }) {
  return (
    <div className={muted ? 'text-stone-300' : ''}>
      <p className="flex items-center justify-end gap-1 text-2xl font-extrabold leading-none tabular-nums">
        {Icon && <Icon size={18} aria-hidden="true" />} {value}
      </p>
      <p className="text-xs uppercase tracking-wider text-stone-300">{label}</p>
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-3 w-3 rounded-full ${color}`} aria-hidden="true" /> {label}
    </span>
  )
}
