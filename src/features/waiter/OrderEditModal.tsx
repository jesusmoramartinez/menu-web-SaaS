import { Ban, ChefHat, MessageSquare, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Sheet } from '@/components/ui/Modal'
import { QtyControl } from '@/components/ui/QtyControl'
import { useStaffMutations } from '@/hooks/useStaffMutations'
import { useToast } from '@/hooks/useToast'
import { formatPrice } from '@/lib/format'
import type { StaffOrder, StaffOrderItem } from '@/types/domain'

interface OrderEditModalProps {
  order: StaffOrder
  restaurantId: string
  currency: string
  onClose: () => void
}

/**
 * El mozo revisa la comanda: ajusta cantidades, edita las notas del cliente
 * o quita ítems antes de enviarla a cocina. Trabaja sobre una copia local y
 * persiste sólo al Guardar / Enviar. El total lo recalcula la base.
 */
export function OrderEditModal({ order, restaurantId, currency, onClose }: OrderEditModalProps) {
  const { editItems, setStatus } = useStaffMutations(restaurantId)
  const toast = useToast()
  const [items, setItems] = useState<StaffOrderItem[]>(() => order.items.map((i) => ({ ...i })))
  const [confirmCancel, setConfirmCancel] = useState(false)
  const busy = editItems.isPending || setStatus.isPending

  const setQty = (id: string, qty: number) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, qty } : i)).filter((i) => i.qty > 0))
  const setNotes = (id: string, notes: string) => setItems((prev) => prev.map((i) => (i.id === id ? { ...i, notes } : i)))

  const total = items.reduce((s, i) => s + i.unitPrice * i.qty, 0)
  const removedIds = order.items.filter((o) => !items.some((i) => i.id === o.id)).map((o) => o.id)
  const changed = items.filter((i) => {
    const orig = order.items.find((o) => o.id === i.id)
    return orig && (orig.qty !== i.qty || orig.notes !== i.notes)
  })

  const persist = async () => {
    if (changed.length || removedIds.length) {
      await editItems.mutateAsync({
        orderId: order.id,
        keep: changed.map((i) => ({ id: i.id, qty: i.qty, notes: i.notes })),
        removeIds: removedIds,
      })
    }
  }

  const handleSave = async () => {
    await persist()
    toast.show('Comanda guardada', 'info')
    onClose()
  }

  const handleSend = async () => {
    await persist()
    await setStatus.mutateAsync({ orderId: order.id, status: 'kitchen' })
    toast.show('Comanda enviada a cocina 👨‍🍳')
    onClose()
  }

  const handleCancel = async () => {
    await setStatus.mutateAsync({ orderId: order.id, status: 'cancelled' })
    toast.show('Comanda cancelada', 'info')
    onClose()
  }

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title={`Comanda · Mesa ${order.tableLabel ?? order.tableNumber}`}
        subtitle="Revisá y ajustá antes de enviar a cocina"
        footer={
          <>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm text-stone-500">Total comanda</span>
              <span className="text-xl font-bold">{formatPrice(total, currency)}</span>
            </div>
            <div className="flex gap-2">
              <Button variant="danger" size="lg" aria-label="Cancelar comanda" onClick={() => setConfirmCancel(true)} className="px-3" disabled={busy}>
                <Ban size={18} />
              </Button>
              <Button variant="secondary" size="lg" disabled={items.length === 0 || busy} onClick={() => void handleSave()}>
                Guardar
              </Button>
              <Button
                variant="success"
                size="lg"
                icon={<ChefHat size={18} />}
                disabled={items.length === 0 || busy}
                onClick={() => void handleSend()}
                className="flex-1 shadow-lg shadow-emerald-600/30"
              >
                {busy ? 'Guardando…' : 'Enviar a Cocina'}
              </Button>
            </div>
          </>
        }
      >
        {items.length === 0 ? (
          <p className="py-10 text-center text-sm text-stone-500">La comanda quedó vacía. Podés cancelarla o cerrar sin guardar.</p>
        ) : (
          <ul className="space-y-3">
            {items.map((i) => (
              <li key={i.id} className="rounded-2xl bg-stone-50 p-3 ring-1 ring-stone-200/70">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold leading-tight">{i.name}</p>
                    {i.selectedOptions.length > 0 && (
                      <p className="text-xs text-stone-600">{i.selectedOptions.map((o) => o.optionName).join(' · ')}</p>
                    )}
                    <p className="text-xs text-stone-500">{formatPrice(i.unitPrice, currency)} c/u</p>
                  </div>
                  <p className="font-bold">{formatPrice(i.unitPrice * i.qty, currency)}</p>
                </div>

                <div className="mt-2 flex items-center justify-between">
                  <QtyControl qty={i.qty} onChange={(q) => setQty(i.id, q)} size="sm" />
                  <Button variant="ghost" size="sm" icon={<Trash2 size={14} />} onClick={() => setQty(i.id, 0)}>
                    Quitar
                  </Button>
                </div>

                <label className="relative mt-2 block">
                  <span className="sr-only">Notas para {i.name}</span>
                  <MessageSquare size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-stone-500" aria-hidden="true" />
                  <input
                    type="text"
                    value={i.notes}
                    maxLength={200}
                    onChange={(e) => setNotes(i.id, e.target.value)}
                    placeholder="Notas para cocina…"
                    className="w-full rounded-lg border border-stone-200 bg-white py-2 pr-3 pl-8 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                  />
                </label>
              </li>
            ))}
          </ul>
        )}
      </Sheet>

      <ConfirmDialog
        open={confirmCancel}
        tone="danger"
        title={`¿Cancelar la comanda de la Mesa ${order.tableLabel ?? order.tableNumber}?`}
        description="El cliente verá el pedido como cancelado. Esta acción no se puede deshacer."
        confirmLabel="Cancelar comanda"
        cancelLabel="Volver"
        onConfirm={() => void handleCancel()}
        onCancel={() => setConfirmCancel(false)}
      />
    </>
  )
}
