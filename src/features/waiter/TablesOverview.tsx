import { DoorOpen, Receipt, Table2, Users } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatPrice, timeAgo } from '@/lib/format'
import type { TableOverview } from '@/types/domain'
import { TableBillSheet } from './TableBillSheet'

interface TablesOverviewProps {
  tables: TableOverview[]
  currency: string
  now: number
  onClose: (sessionId: string) => void
  closing?: boolean
}

/** Grilla de mesas agrupadas por sector: libre / abierta / cuenta pedida, con total y "Cerrar mesa". */
export function TablesOverview({ tables, currency, now, onClose, closing }: TablesOverviewProps) {
  if (tables.length === 0) {
    return <EmptyState icon={Table2} title="Todavía no hay mesas cargadas" subtitle="Se configuran desde el panel de administración." />
  }

  const bySector = new Map<string, TableOverview[]>()
  for (const t of tables) {
    const key = t.sectorName ?? 'Sin sector'
    bySector.set(key, [...(bySector.get(key) ?? []), t])
  }

  return (
    <div className="space-y-6">
      {[...bySector.entries()].map(([sector, group]) => (
        <section key={sector} aria-labelledby={`sector-${sector}`}>
          <h3 id={`sector-${sector}`} className="mb-3 text-sm font-bold tracking-wide text-stone-500 uppercase">
            {sector}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {group.map((t) => (
              <TableCard key={t.id} table={t} currency={currency} now={now} onClose={onClose} closing={closing} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function TableCard({ table, currency, now, onClose, closing }: { table: TableOverview } & Omit<TablesOverviewProps, 'tables'>) {
  const open = table.sessionId !== null
  const billRequested = table.sessionStatus === 'bill_requested'
  const [billOpen, setBillOpen] = useState(false)

  return (
    <article
      className={`rounded-2xl p-4 shadow-sm ring-1 ${open ? (billRequested ? 'bg-sky-50 ring-sky-200' : 'bg-white ring-stone-200/70') : 'bg-stone-50 ring-stone-200/50'}`}
    >
      <div className="flex items-start justify-between">
        <p className="text-lg font-bold">Mesa {table.label ?? table.number}</p>
        <span
          className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
            !open ? 'bg-stone-200 text-stone-600' : billRequested ? 'bg-sky-100 text-sky-800' : 'bg-emerald-100 text-emerald-800'
          }`}
        >
          {!open ? <DoorOpen size={12} aria-hidden="true" /> : billRequested ? <Receipt size={12} aria-hidden="true" /> : null}
          {!open ? 'Libre' : billRequested ? 'Pidió la cuenta' : 'Abierta'}
        </span>
      </div>

      {open ? (
        <>
          <p className="mt-1 flex items-center gap-2 text-xs text-stone-500">
            <span>Desde {timeAgo(new Date(table.openedAt as string).getTime(), now)}</span>
            {table.guests !== null && (
              <span className="flex items-center gap-1">
                <Users size={12} aria-hidden="true" /> {table.guests}
              </span>
            )}
          </p>
          <p className="mt-2 text-xl font-bold">{formatPrice(table.total, currency)}</p>
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" size="sm" className="flex-1" onClick={() => setBillOpen(true)}>
              Cuenta
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="flex-1"
              disabled={!table.canClose || closing}
              title={table.canClose ? undefined : 'Hay pedidos sin entregar en esta mesa'}
              onClick={() => onClose(table.sessionId as string)}
            >
              Cerrar mesa
            </Button>
          </div>
          {billOpen && <TableBillSheet table={table} currency={currency} onClose={() => setBillOpen(false)} />}
        </>
      ) : (
        <p className="mt-4 text-sm text-stone-500">Sin comensales</p>
      )}
    </article>
  )
}
