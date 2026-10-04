import { Ban, CheckCircle2, Eye, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { CardsSkeleton } from '@/components/ui/Skeleton'
import { useRestaurantScope } from '@/features/staff/useRestaurantScope'
import { useMenuAdminMutations } from '@/hooks/useAdminMutations'
import { useAdminCategories, useAdminMenuItems } from '@/hooks/useAdminQueries'
import { isSoldOut } from '@/lib/soldOut'
import type { AdminCategory, AdminMenuItem } from '@/types/domain'
import { ItemEditModal } from './ItemEditModal'

const priceInputCls =
  'w-24 rounded-lg border border-stone-200 bg-white px-2 py-1 text-sm text-right outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20'

export default function AdminMenuPage() {
  const { restaurant } = useRestaurantScope()
  const categories = useAdminCategories(restaurant.id)
  const items = useAdminMenuItems(restaurant.id)
  const m = useMenuAdminMutations(restaurant.id)

  const [newCategoryName, setNewCategoryName] = useState('')
  const [editingItem, setEditingItem] = useState<AdminMenuItem | 'new' | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ kind: 'category' | 'item'; id: string; name: string } | null>(null)

  if (categories.isPending || items.isPending) return <CardsSkeleton count={4} />
  if (categories.isError) return <ErrorState error={categories.error} onRetry={() => categories.refetch()} title="No pudimos cargar las categorías" />
  if (items.isError) return <ErrorState error={items.error} onRetry={() => items.refetch()} title="No pudimos cargar los platos" />

  const cats = categories.data
  const allItems = items.data

  const addCategory = () => {
    const name = newCategoryName.trim()
    if (!name) return
    m.saveCategory.mutate({ name, emoji: null, sortOrder: cats.length })
    setNewCategoryName('')
  }

  const moveCategory = (cat: AdminCategory, dir: -1 | 1) => {
    const sorted = [...cats].sort((a, b) => a.sortOrder - b.sortOrder)
    const idx = sorted.findIndex((c) => c.id === cat.id)
    const swapWith = sorted[idx + dir]
    if (!swapWith) return
    m.saveCategory.mutate({ id: cat.id, name: cat.name, emoji: cat.emoji, sortOrder: swapWith.sortOrder })
    m.saveCategory.mutate({ id: swapWith.id, name: swapWith.name, emoji: swapWith.emoji, sortOrder: cat.sortOrder })
  }

  const confirmDelete = () => {
    if (!deleteTarget) return
    if (deleteTarget.kind === 'category') m.deleteCategory.mutate(deleteTarget.id)
    else m.deleteMenuItem.mutate(deleteTarget.id)
    setDeleteTarget(null)
  }

  return (
    <div className="space-y-8">
      <section aria-labelledby="cats-title">
        <h2 id="cats-title" className="mb-3 text-lg font-bold">
          Categorías
        </h2>
        <div className="space-y-2">
          {[...cats]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((c, idx) => {
              const itemCount = allItems.filter((i) => i.categoryId === c.id).length
              return (
                <div key={c.id} className="flex items-center gap-2 rounded-xl bg-white p-2.5 ring-1 ring-stone-200/70">
                  <div className="flex flex-col">
                    <button type="button" disabled={idx === 0} onClick={() => moveCategory(c, -1)} className="text-stone-500 hover:text-stone-700 disabled:opacity-20" aria-label={`Subir ${c.name}`}>
                      ▲
                    </button>
                    <button type="button" disabled={idx === cats.length - 1} onClick={() => moveCategory(c, 1)} className="text-stone-500 hover:text-stone-700 disabled:opacity-20" aria-label={`Bajar ${c.name}`}>
                      ▼
                    </button>
                  </div>
                  <span className={`flex-1 font-medium ${c.isActive ? '' : 'text-stone-500 line-through'}`}>
                    {c.emoji ? `${c.emoji} ` : ''}
                    {c.name}
                    {itemCount > 0 && <span className="ml-1 text-xs font-normal text-stone-500">({itemCount})</span>}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={c.isActive ? <Eye size={14} /> : <EyeOff size={14} />}
                    onClick={() => m.setCategoryActive.mutate({ id: c.id, isActive: !c.isActive })}
                  >
                    {c.isActive ? 'Visible' : 'Oculta'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Trash2 size={14} />}
                    disabled={itemCount > 0}
                    title={itemCount > 0 ? 'Tiene platos: movelos o borralos primero' : undefined}
                    onClick={() => setDeleteTarget({ kind: 'category', id: c.id, name: c.name })}
                    aria-label={`Eliminar ${c.name}`}
                  />
                </div>
              )
            })}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addCategory()}
            placeholder="Nueva categoría…"
            className="flex-1 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
          <Button variant="secondary" icon={<Plus size={16} />} onClick={addCategory} disabled={!newCategoryName.trim()}>
            Agregar
          </Button>
        </div>
      </section>

      <section aria-labelledby="items-title">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="items-title" className="text-lg font-bold">
            Platos
          </h2>
          <Button icon={<Plus size={16} />} onClick={() => setEditingItem('new')} disabled={cats.length === 0}>
            Nuevo plato
          </Button>
        </div>

        {cats.length === 0 ? (
          <EmptyState title="Creá una categoría primero" subtitle="Los platos necesitan una categoría." />
        ) : allItems.length === 0 ? (
          <EmptyState title="Todavía no hay platos" subtitle='Usá "Nuevo plato" para cargar el primero.' />
        ) : (
          [...cats]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((cat) => {
              const catItems = allItems.filter((i) => i.categoryId === cat.id).sort((a, b) => a.sortOrder - b.sortOrder)
              if (catItems.length === 0) return null
              return (
                <div key={cat.id} className="mb-5">
                  <h3 className="mb-2 text-sm font-bold text-stone-500 uppercase tracking-wide">
                    {cat.emoji ? `${cat.emoji} ` : ''}
                    {cat.name}
                  </h3>
                  <ul className="space-y-2">
                    {catItems.map((item) => (
                      <li key={item.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-2.5 ring-1 ring-stone-200/70">
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
                        ) : (
                          <div className="h-11 w-11 shrink-0 rounded-lg bg-stone-100" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className={`truncate font-medium ${item.isAvailable ? '' : 'text-stone-500'}`}>{item.name}</p>
                          {isSoldOut(item.soldOutUntil) && <span className="text-xs font-semibold text-amber-600">Agotado hoy</span>}
                        </div>

                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          defaultValue={(item.price / 100).toFixed(2)}
                          onBlur={(e) => {
                            const cents = Math.round(Number(e.target.value) * 100)
                            if (Number.isFinite(cents) && cents >= 0 && cents !== item.price) m.updateItemPrice.mutate({ id: item.id, price: cents })
                          }}
                          className={priceInputCls}
                          aria-label={`Precio de ${item.name}`}
                        />

                        <Button
                          variant="ghost"
                          size="sm"
                          icon={item.isAvailable ? <Eye size={14} /> : <EyeOff size={14} />}
                          onClick={() => m.setItemAvailable.mutate({ id: item.id, isAvailable: !item.isAvailable })}
                          title={item.isAvailable ? 'Ocultar del menú' : 'Mostrar en el menú'}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={isSoldOut(item.soldOutUntil) ? <CheckCircle2 size={14} /> : <Ban size={14} />}
                          onClick={() => m.setSoldOutToday.mutate({ id: item.id, soldOut: !isSoldOut(item.soldOutUntil) })}
                          title={isSoldOut(item.soldOutUntil) ? 'Marcar disponible' : 'Marcar agotado hoy'}
                        />
                        <Button variant="ghost" size="sm" icon={<Pencil size={14} />} onClick={() => setEditingItem(item)} aria-label={`Editar ${item.name}`} />
                        <Button variant="ghost" size="sm" icon={<Trash2 size={14} />} onClick={() => setDeleteTarget({ kind: 'item', id: item.id, name: item.name })} aria-label={`Eliminar ${item.name}`} />
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })
        )}
      </section>

      {editingItem && (
        <ItemEditModal
          key={editingItem === 'new' ? 'new' : editingItem.id}
          restaurantId={restaurant.id}
          categories={cats}
          item={editingItem === 'new' ? null : editingItem}
          nextSortOrder={allItems.length}
          onClose={() => setEditingItem(null)}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        tone="danger"
        title={`¿Eliminar "${deleteTarget?.name}"?`}
        description="Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
