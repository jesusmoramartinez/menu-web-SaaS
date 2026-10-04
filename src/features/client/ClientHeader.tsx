import { Bell, Check, Receipt, UtensilsCrossed } from 'lucide-react'
import type { Restaurant, TableInfo } from '@/types/domain'

interface ClientHeaderProps {
  restaurant: Restaurant
  table: TableInfo
  waiterCalled: boolean
  billRequested: boolean
  busy: boolean
  onCallWaiter: () => void
  onRequestBill: () => void
}

export function ClientHeader({
  restaurant,
  table,
  waiterCalled,
  billRequested,
  busy,
  onCallWaiter,
  onRequestBill,
}: ClientHeaderProps) {
  return (
    <header className="bg-gradient-to-br from-brand-600 to-brand-700 text-white">
      <div className="mx-auto max-w-client px-4 pt-5 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {restaurant.logoUrl ? (
              <img src={restaurant.logoUrl} alt="" className="h-12 w-12 shrink-0 rounded-2xl bg-white/90 object-cover ring-1 ring-white/30" />
            ) : (
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/30">
                <UtensilsCrossed size={24} aria-hidden="true" />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold leading-tight">{restaurant.name}</h1>
              {restaurant.tagline && <p className="truncate text-xs text-brand-100">{restaurant.tagline}</p>}
            </div>
          </div>

          <div className="shrink-0 rounded-xl bg-white/15 px-3 py-1.5 text-right ring-1 ring-white/30">
            <p className="text-[10px] uppercase tracking-wider text-brand-100">{table.label ? 'Mesa' : 'Mesa'}</p>
            <p className="text-xl font-bold leading-none">{table.label ?? table.number}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onCallWaiter}
            disabled={busy || waiterCalled}
            className="flex items-center justify-center gap-2 rounded-xl bg-white/15 px-3 py-2.5 text-sm font-semibold ring-1 ring-white/30 transition active:scale-95 hover:bg-white/25 disabled:opacity-80 disabled:active:scale-100"
          >
            {waiterCalled ? <Check size={16} aria-hidden="true" /> : <Bell size={16} aria-hidden="true" />}
            {waiterCalled ? 'Mozo avisado' : 'Llamar al Mozo'}
          </button>
          <button
            type="button"
            onClick={onRequestBill}
            disabled={busy || billRequested}
            className="flex items-center justify-center gap-2 rounded-xl bg-white px-3 py-2.5 text-sm font-semibold text-brand-700 shadow transition active:scale-95 hover:bg-brand-50 disabled:opacity-90 disabled:active:scale-100"
          >
            {billRequested ? <Check size={16} aria-hidden="true" /> : <Receipt size={16} aria-hidden="true" />}
            {billRequested ? 'Cuenta pedida' : 'Pedir la Cuenta'}
          </button>
        </div>
      </div>
    </header>
  )
}
