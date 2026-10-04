import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useRestaurantScope } from '@/features/staff/useRestaurantScope'
import { useServiceCharges } from '@/hooks/useQueries'
import { useToast } from '@/hooks/useToast'
import { toAppError } from '@/lib/errors'
import { formatPrice } from '@/lib/format'
import { qk } from '@/lib/queryKeys'
import { createServiceCharge, deleteServiceCharge, updateServiceCharge } from '@/services/charges'
import type { ChargeMode, ServiceCharge } from '@/types/domain'

const inputCls =
  'w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20'

const MODE_LABEL: Record<ChargeMode, string> = {
  per_person: 'Por persona',
  per_table: 'Por mesa',
  percent: '% del consumo',
}

/**
 * Catálogo de cargos fijos (cubierto, servicio de mesa…).
 *
 * Esto define lo que el restaurante **puede** cobrar. Qué se le cobra a cada mesa lo decide
 * el mozo desde la pestaña Mesas: un cubierto se perdona seguido, así que aplicarlos
 * automáticamente sería un problema, no una comodidad.
 */
export function ServiceChargesSection() {
  const { restaurant } = useRestaurantScope()
  const charges = useServiceCharges(restaurant.id)
  const toast = useToast()
  const queryClient = useQueryClient()

  const [name, setName] = useState('')
  const [mode, setMode] = useState<ChargeMode>('per_person')
  const [amount, setAmount] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<ServiceCharge | null>(null)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: qk.serviceCharges(restaurant.id) })
  const onError = (err: unknown) => toast.show(toAppError(err).message, 'error')

  const create = useMutation({
    mutationFn: () =>
      createServiceCharge(restaurant.id, { name: name.trim(), mode, amount: toStored(amount), suggested: true }),
    onSuccess: async () => {
      setName('')
      setAmount('')
      await invalidate()
    },
    onError,
  })
  const update = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => updateServiceCharge(id, { isActive }),
    onSuccess: invalidate,
    onError,
  })
  const remove = useMutation({
    mutationFn: (id: string) => deleteServiceCharge(id),
    onSuccess: async () => {
      setDeleteTarget(null)
      await invalidate()
    },
    onError,
  })

  const parsed = toStored(amount)
  const valid = name.trim().length >= 2 && Number.isFinite(parsed) && parsed > 0

  return (
    <section className="max-w-lg rounded-2xl bg-white p-5 ring-1 ring-stone-200/70" aria-labelledby="cargos-title">
      <h2 id="cargos-title" className="font-bold">
        Cargos fijos
      </h2>
      <p className="mt-1 text-sm text-stone-500">
        Cubierto, servicio de mesa… Se configuran acá, pero <strong>el mozo decide en cada mesa</strong> si se cobran.
      </p>

      {(charges.data ?? []).length > 0 && (
        <ul className="mt-4 divide-y divide-stone-100">
          {charges.data?.map((c) => (
            <li key={c.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className={`truncate font-medium ${c.isActive ? '' : 'text-stone-500 line-through'}`}>{c.name}</p>
                <p className="text-xs text-stone-500">
                  {MODE_LABEL[c.mode]} ·{' '}
                  {c.mode === 'percent'
                    ? `${(c.amount / 100).toLocaleString('es-AR')} %`
                    : formatPrice(c.amount, restaurant.currency)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => update.mutate({ id: c.id, isActive: !c.isActive })}
                title={c.isActive ? 'Desactivar' : 'Activar'}
              >
                {c.isActive ? 'Activo' : 'Inactivo'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={<Trash2 size={14} />}
                onClick={() => setDeleteTarget(c)}
                aria-label={`Eliminar ${c.name}`}
              />
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 space-y-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre (ej. Cubierto)" className={inputCls} />
        <div className="flex gap-2">
          <select value={mode} onChange={(e) => setMode(e.target.value as ChargeMode)} className={inputCls} aria-label="Modo de cálculo">
            {(Object.keys(MODE_LABEL) as ChargeMode[]).map((m) => (
              <option key={m} value={m}>
                {MODE_LABEL[m]}
              </option>
            ))}
          </select>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder={mode === 'percent' ? '10' : '500'}
            aria-label={mode === 'percent' ? 'Porcentaje' : 'Importe'}
            className={inputCls}
          />
        </div>
        <Button icon={<Plus size={16} />} onClick={() => create.mutate()} disabled={!valid || create.isPending} full>
          Agregar cargo
        </Button>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title={`¿Eliminar "${deleteTarget?.name}"?`}
        description="Las mesas que ya lo tengan aplicado conservan el importe cobrado; sólo deja de ofrecerse de acá en más."
        confirmLabel="Eliminar"
        onConfirm={() => deleteTarget && remove.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  )
}

/**
 * Lo que se escribe en la base: centavos para los importes, y puntos básicos para los
 * porcentajes (1000 = 10,00 %), para poder cobrar un 10,5 % sin decimales rotos.
 */
function toStored(value: string): number {
  const n = Number(value.replace(',', '.'))
  if (!Number.isFinite(n)) return NaN
  return Math.round(n * 100)
}
