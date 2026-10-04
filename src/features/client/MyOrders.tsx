import { ClipboardList, Receipt, UtensilsCrossed } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { CardsSkeleton } from '@/components/ui/Skeleton'
import { formatPrice, timeAgo } from '@/lib/format'
import { useNow } from '@/lib/useNow'
import type { SessionState } from '@/types/domain'
import { OrderStatusSteps } from './OrderStatusSteps'

interface MyOrdersProps {
  hasSession: boolean
  state: SessionState | null | undefined
  isPending: boolean
  error: unknown
  currency: string
  billRequested: boolean
  onRetry: () => void
  onGoToMenu: () => void
  onRequestBill: () => void
}

/** Pestaña "Mis pedidos": estado en vivo de cada pedido de la mesa y la cuenta acumulada. */
export function MyOrders({ hasSession, state, isPending, error, currency, billRequested, onRetry, onGoToMenu, onRequestBill }: MyOrdersProps) {
  const now = useNow(10_000)

  if (!hasSession || (state === null && !isPending)) {
    return (
      <div className="mx-auto max-w-client px-4 py-6">
        <EmptyState icon={ClipboardList} title="Todavía no pediste nada" subtitle="Cuando confirmes un pedido, vas a poder seguirlo desde acá." />
        <div className="mt-4 flex justify-center">
          <Button icon={<UtensilsCrossed size={16} />} onClick={onGoToMenu}>
            Ver el menú
          </Button>
        </div>
      </div>
    )
  }

  if (isPending || !state) {
    return (
      <div className="mx-auto max-w-client px-4 py-6">
        {error ? <ErrorState error={error} onRetry={onRetry} /> : <CardsSkeleton count={2} />}
      </div>
    )
  }

  const active = state.orders.filter((o) => o.status !== 'cancelled')

  return (
    <div className="mx-auto max-w-client space-y-4 px-4 py-4">
      {state.orders.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Todavía no pediste nada" subtitle="Cuando confirmes un pedido, vas a poder seguirlo desde acá." />
      ) : (
        <ul className="space-y-3">
          {state.orders.map((o, idx) => (
            <li key={o.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200/70">
              <div className="flex items-baseline justify-between">
                <p className="font-bold">Pedido {state.orders.length - idx}</p>
                <p className="text-xs text-stone-500">{timeAgo(new Date(o.createdAt).getTime(), now)}</p>
              </div>
              <div className="mt-3">
                <OrderStatusSteps status={o.status} />
              </div>
              <ul className="mt-3 space-y-1 border-t border-stone-100 pt-3 text-sm">
                {o.items.map((i) => (
                  <li key={i.id} className="flex justify-between gap-2">
                    <span>
                      <span className="font-bold">{i.qty}×</span> {i.name}
                      {i.selectedOptions.length > 0 && (
                        <span className="block text-xs text-stone-500">{i.selectedOptions.map((s) => s.optionName).join(' · ')}</span>
                      )}
                      {i.notes && <span className="block text-xs text-amber-700">“{i.notes}”</span>}
                    </span>
                    <span className="text-stone-600 tabular-nums">{formatPrice(i.lineTotal, currency)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-right text-sm font-semibold">{formatPrice(o.total, currency)}</p>
            </li>
          ))}
        </ul>
      )}

      <section className="rounded-2xl bg-stone-900 p-4 text-white" aria-labelledby="bill-title">
        <div className="flex items-center justify-between">
          <h2 id="bill-title" className="flex items-center gap-2 font-bold">
            <Receipt size={18} aria-hidden="true" /> La cuenta
          </h2>
          <span className="text-2xl font-bold">{formatPrice(state.total, currency)}</span>
        </div>
        <p className="mt-1 text-xs text-stone-400">
          {active.length} {active.length === 1 ? 'pedido' : 'pedidos'} en esta mesa · se paga en el local
        </p>
        <Button
          variant={billRequested ? 'secondary' : 'primary'}
          full
          className="mt-3"
          disabled={billRequested || state.total === 0}
          onClick={onRequestBill}
        >
          {billRequested ? 'Cuenta pedida · el mozo se acerca' : 'Pedir la cuenta'}
        </Button>
      </section>
    </div>
  )
}
