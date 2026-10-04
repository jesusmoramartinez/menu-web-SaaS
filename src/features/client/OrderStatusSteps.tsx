import { Check } from 'lucide-react'
import type { OrderStatus } from '@/types/domain'

const STEPS: { status: OrderStatus; label: string }[] = [
  { status: 'pending', label: 'Recibido' },
  { status: 'kitchen', label: 'En cocina' },
  { status: 'ready', label: 'Listo' },
  { status: 'delivered', label: 'Entregado' },
]

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Recibido · el mozo lo está revisando',
  kitchen: 'En cocina · lo están preparando',
  ready: '¡Listo! · el mozo lo trae a la mesa',
  delivered: 'Entregado · ¡buen provecho!',
  cancelled: 'Cancelado por el personal',
}

/** Línea de progreso Recibido → En cocina → Listo → Entregado. */
export function OrderStatusSteps({ status }: { status: OrderStatus }) {
  if (status === 'cancelled') {
    return <p className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700">{STATUS_LABEL.cancelled}</p>
  }
  const current = STEPS.findIndex((s) => s.status === status)
  return (
    <div>
      <ol className="flex items-center" aria-label="Estado del pedido">
        {STEPS.map((s, i) => {
          const done = i < current
          const active = i === current
          return (
            <li key={s.status} className="flex flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ring-2
                    ${done ? 'bg-emerald-600 text-white ring-emerald-600' : active ? 'bg-brand-500 text-white ring-brand-500 animate-pulse' : 'bg-white text-stone-500 ring-stone-300'}`}
                  aria-current={active ? 'step' : undefined}
                >
                  {done ? <Check size={14} aria-hidden="true" /> : i + 1}
                </span>
                <span className={`mt-1 text-[10px] whitespace-nowrap ${active ? 'font-bold text-stone-900' : 'text-stone-500'}`}>{s.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <span className={`mx-1 mb-4 h-0.5 flex-1 rounded ${i < current ? 'bg-emerald-600' : 'bg-stone-200'}`} aria-hidden="true" />
              )}
            </li>
          )
        })}
      </ol>
      <p className="mt-2 text-xs text-stone-600">{STATUS_LABEL[status]}</p>
    </div>
  )
}
