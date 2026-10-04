import { Download, EyeOff, Plus, Printer, Trash2, Undo2 } from 'lucide-react'
import QRCode from 'qrcode'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { CardsSkeleton } from '@/components/ui/Skeleton'
import { useRestaurantScope } from '@/features/staff/useRestaurantScope'
import { useTablesAdminMutations } from '@/hooks/useAdminMutations'
import { useAdminTables, useSectors } from '@/hooks/useAdminQueries'
import type { AdminTable } from '@/types/domain'
import { QrCode } from './QrCode'

const inputCls = 'rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20'

export default function AdminTablesPage() {
  const { restaurant } = useRestaurantScope()
  const sectors = useSectors(restaurant.id)
  const tables = useAdminTables(restaurant.id)
  const m = useTablesAdminMutations(restaurant.id)

  const [newSector, setNewSector] = useState('')
  const [newTable, setNewTable] = useState({ number: '', label: '', sectorId: '' })

  if (sectors.isPending || tables.isPending) return <CardsSkeleton count={4} />
  if (sectors.isError) return <ErrorState error={sectors.error} onRetry={() => sectors.refetch()} title="No pudimos cargar los sectores" />
  if (tables.isError) return <ErrorState error={tables.error} onRetry={() => tables.refetch()} title="No pudimos cargar las mesas" />

  const sectorList = sectors.data
  const tableList = tables.data
  const clientUrl = (t: AdminTable) => `${window.location.origin}/r/${restaurant.slug}/m/${t.token}`

  const addSector = () => {
    const name = newSector.trim()
    if (!name) return
    m.saveSector.mutate({ name, sortOrder: sectorList.length })
    setNewSector('')
  }

  const addTable = () => {
    const number = Number(newTable.number)
    if (!number || number <= 0) return
    m.saveTable.mutate({ number, label: newTable.label.trim() || null, sectorId: newTable.sectorId || null })
    setNewTable({ number: '', label: '', sectorId: newTable.sectorId })
  }

  const downloadQr = async (t: AdminTable) => {
    const dataUrl = await QRCode.toDataURL(clientUrl(t), { width: 512, margin: 1 })
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `mesa-${t.number}-qr.png`
    a.click()
  }

  return (
    <div className="space-y-8">
      <section className="print:hidden" aria-labelledby="sectors-title">
        <h2 id="sectors-title" className="mb-3 text-lg font-bold">
          Sectores
        </h2>
        <div className="flex flex-wrap gap-2">
          {sectorList.map((s) => (
            <span key={s.id} className="flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-sm ring-1 ring-stone-200">
              {s.name}
              <button type="button" onClick={() => m.deleteSector.mutate(s.id)} className="text-stone-500 hover:text-red-600" aria-label={`Eliminar sector ${s.name}`}>
                <Trash2 size={13} />
              </button>
            </span>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input value={newSector} onChange={(e) => setNewSector(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addSector()} placeholder="Nuevo sector (ej. Terraza)" className={`${inputCls} flex-1`} />
          <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={addSector} disabled={!newSector.trim()}>
            Agregar
          </Button>
        </div>
      </section>

      <section className="print:hidden" aria-labelledby="tables-title">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="tables-title" className="text-lg font-bold">
            Mesas
          </h2>
          <Button variant="secondary" size="sm" icon={<Printer size={14} />} onClick={() => window.print()} disabled={tableList.length === 0}>
            Imprimir hoja de QRs
          </Button>
        </div>

        {tableList.length === 0 ? (
          <EmptyState title="Todavía no hay mesas" subtitle="Agregá la primera con el formulario de abajo." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tableList.map((t) => (
              <div key={t.id} className={`rounded-xl bg-white p-3 ring-1 ring-stone-200/70 ${t.isActive ? '' : 'opacity-60'}`}>
                <div className="flex items-center justify-between">
                  <p className="font-bold">
                    Mesa {t.label ?? t.number}
                    {!t.isActive && <span className="ml-2 text-xs font-normal text-stone-500">(inactiva)</span>}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={t.isActive ? <EyeOff size={14} /> : <Undo2 size={14} />}
                    onClick={() => m.setTableActive.mutate({ id: t.id, isActive: !t.isActive })}
                    title={t.isActive ? 'Desactivar (deja de aceptar pedidos, conserva el historial)' : 'Reactivar'}
                  />
                </div>
                <select
                  defaultValue={t.sectorId ?? ''}
                  onChange={(e) => m.saveTable.mutate({ id: t.id, number: t.number, label: t.label, sectorId: e.target.value || null })}
                  className={`mt-2 w-full ${inputCls}`}
                >
                  <option value="">Sin sector</option>
                  {sectorList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <div className="mt-3 flex items-center gap-3">
                  <QrCode text={clientUrl(t)} size={72} alt={`QR de la mesa ${t.number}`} className="rounded-lg ring-1 ring-stone-200" />
                  <Button variant="secondary" size="sm" icon={<Download size={13} />} onClick={() => void downloadQr(t)}>
                    Descargar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2 rounded-xl bg-white p-3 ring-1 ring-stone-200/70">
          <input
            type="number"
            min={1}
            value={newTable.number}
            onChange={(e) => setNewTable((s) => ({ ...s, number: e.target.value }))}
            placeholder="N.º"
            className={`${inputCls} w-20`}
          />
          <input value={newTable.label} onChange={(e) => setNewTable((s) => ({ ...s, label: e.target.value }))} placeholder="Etiqueta (opcional)" className={`${inputCls} flex-1`} />
          <select value={newTable.sectorId} onChange={(e) => setNewTable((s) => ({ ...s, sectorId: e.target.value }))} className={inputCls}>
            <option value="">Sin sector</option>
            {sectorList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <Button size="sm" icon={<Plus size={14} />} onClick={addTable} disabled={!newTable.number}>
            Agregar mesa
          </Button>
        </div>
      </section>

      {/* Hoja para imprimir: oculta en pantalla, visible sólo al imprimir */}
      <section className="hidden print:block">
        <div className="grid grid-cols-2 gap-6">
          {tableList
            .filter((t) => t.isActive)
            .map((t) => (
              <div key={t.id} className="flex flex-col items-center gap-2 border border-stone-300 p-6 text-center break-inside-avoid">
                <p className="text-lg font-bold">{restaurant.name}</p>
                <QrCode text={clientUrl(t)} size={220} alt={`QR de la mesa ${t.number}`} />
                <p className="text-2xl font-extrabold">Mesa {t.label ?? t.number}</p>
                <p className="text-xs text-stone-500">Escaneá para ver el menú y pedir</p>
              </div>
            ))}
        </div>
      </section>
    </div>
  )
}
