import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Receipt, Users } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Sheet } from '@/components/ui/Modal'
import { QtyControl } from '@/components/ui/QtyControl'
import { useRestaurantScope } from '@/features/staff/useRestaurantScope'
import { useServiceCharges, useSessionChargeIds, useSessionState } from '@/hooks/useQueries'
import { useToast } from '@/hooks/useToast'
import { toAppError } from '@/lib/errors'
import { formatPrice } from '@/lib/format'
import { qk } from '@/lib/queryKeys'
import { addSessionAdjustment, setSessionCharge, setSessionGuests } from '@/services/charges'
import type { TableOverview } from '@/types/domain'

interface TableBillSheetProps {
  table: TableOverview
  currency: string
  onClose: () => void
}

/**
 * Cuenta de una mesa abierta, para el mozo: cuántos comensales, qué cargos se le cobran y
 * los ajustes. Va en una hoja aparte y no en la tarjeta de la mesa, para que la grilla siga
 * entrando a 360px.
 *
 * Los cargos del catálogo **no se aplican solos**: el mozo decide mesa por mesa, porque el
 * cubierto se perdona seguido. El importe lo congela el servidor (`set_session_charge`).
 */
export function TableBillSheet({ table, currency, onClose }: TableBillSheetProps) {
  const { restaurant } = useRestaurantScope()
  const sessionId = table.sessionId as string
  const toast = useToast()
  const queryClient = useQueryClient()

  const state = useSessionState(sessionId)
  const catalog = useServiceCharges(restaurant.id)
  const applied = useSessionChargeIds(sessionId)

  const [adjAmount, setAdjAmount] = useState('')
  const [adjReason, setAdjReason] = useState('')

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.session(sessionId) }),
      queryClient.invalidateQueries({ queryKey: qk.sessionCharges(sessionId) }),
      queryClient.invalidateQueries({ queryKey: qk.staff(restaurant.id) }),
    ])
  }
  const onError = (err: unknown) => toast.show(toAppError(err).message, 'error')

  const guests = useMutation({ mutationFn: (n: number | null) => setSessionGuests(sessionId, n), onSuccess: refresh, onError })
  const charge = useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => setSessionCharge(sessionId, id, on),
    onSuccess: refresh,
    onError,
  })
  const adjust = useMutation({
    mutationFn: ({ amount, reason }: { amount: number; reason: string }) =>
      addSessionAdjustment(restaurant.id, sessionId, amount, reason),
    onSuccess: async () => {
      setAdjAmount('')
      setAdjReason('')
      toast.show('Ajuste agregado')
      await refresh()
    },
    onError,
  })

  const data = state.data
  const activeCharges = (catalog.data ?? []).filter((c) => c.isActive)
  const appliedIds = new Set(applied.data ?? [])

  // El importe se escribe en la moneda del restaurante, no en centavos.
  const parsedAdj = Math.round(Number(adjAmount.replace(',', '.')) * 100)
  const adjValid = Number.isFinite(parsedAdj) && parsedAdj !== 0 && adjReason.trim().length >= 3

  return (
    <Sheet
      open
      onClose={onClose}
      icon={<Receipt size={18} aria-hidden="true" />}
      title={`Mesa ${table.number}`}
      subtitle={table.label ?? undefined}
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-stone-500">Total</span>
          <span className="text-xl font-bold tabular-nums">{formatPrice(data?.total ?? table.total, currency)}</span>
        </div>
      }
    >
      <section className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-stone-500" aria-hidden="true" />
          <span className="text-sm font-semibold">Comensales</span>
        </div>
        <QtyControl
          qty={table.guests ?? 1}
          min={1}
          onChange={(n) => guests.mutate(n)}
        />
      </section>

      <section className="mt-5" aria-labelledby="cargos-title">
        <h3 id="cargos-title" className="text-sm font-bold">
          Cargos
        </h3>
        {activeCharges.length === 0 ? (
          <p className="mt-1 text-sm text-stone-500">
            Este restaurante no tiene cargos configurados. Se cargan desde Administración → Configuración.
          </p>
        ) : (
          <ul className="mt-2 space-y-1">
            {activeCharges.map((c) => {
              const on = appliedIds.has(c.id)
              return (
                <li key={c.id}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-1 hover:bg-stone-50">
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={charge.isPending}
                      onChange={(e) => charge.mutate({ id: c.id, on: e.target.checked })}
                      className="h-5 w-5 shrink-0 accent-brand-500"
                    />
                    <span className="flex-1 truncate text-sm font-medium">{c.name}</span>
                    <span className="text-sm text-stone-500 tabular-nums">
                      {c.mode === 'percent'
                        ? `${(c.amount / 100).toLocaleString('es-AR')} %`
                        : `${formatPrice(c.amount, currency)}${c.mode === 'per_person' ? ' p/persona' : ''}`}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="mt-5" aria-labelledby="ajustes-title">
        <h3 id="ajustes-title" className="text-sm font-bold">
          Ajustes
        </h3>
        {(data?.adjustments.length ?? 0) > 0 && (
          <ul className="mt-2 space-y-1 text-sm">
            {data?.adjustments.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3">
                <span className="truncate text-stone-600">{a.reason}</span>
                <span className="tabular-nums">
                  {a.amount < 0 ? '− ' : '+ '}
                  {formatPrice(Math.abs(a.amount), currency)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 flex gap-2">
          <input
            value={adjAmount}
            onChange={(e) => setAdjAmount(e.target.value)}
            inputMode="decimal"
            placeholder="Importe"
            aria-label="Importe del ajuste"
            className="w-28 rounded-lg border border-stone-200 px-2 py-2 text-sm outline-none focus:border-brand-500"
          />
          <input
            value={adjReason}
            onChange={(e) => setAdjReason(e.target.value)}
            placeholder="Motivo (obligatorio)"
            aria-label="Motivo del ajuste"
            className="flex-1 rounded-lg border border-stone-200 px-2 py-2 text-sm outline-none focus:border-brand-500"
          />
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="mt-2"
          disabled={!adjValid || adjust.isPending}
          onClick={() => adjust.mutate({ amount: parsedAdj, reason: adjReason.trim() })}
        >
          Agregar ajuste
        </Button>
        <p className="mt-1 text-xs text-stone-500">
          Un importe negativo es un descuento, y sólo lo puede cargar el dueño o administración.
        </p>
      </section>
    </Sheet>
  )
}
