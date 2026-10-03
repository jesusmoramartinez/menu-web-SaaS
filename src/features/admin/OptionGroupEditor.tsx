import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useMenuAdminMutations } from '@/hooks/useAdminMutations'
import { useAdminMenuItems } from '@/hooks/useAdminQueries'
import type { OptionSelection } from '@/types/domain'

const smallInputCls = 'rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20'

interface OptionGroupEditorProps {
  restaurantId: string
  menuItemId: string
}

/**
 * Editor de variantes (tamaño, extras…) de un plato. Cada acción persiste al toque
 * (blur / click), no hay un "Guardar" general — igual que el resto del admin.
 * Lee los grupos desde el caché de useAdminMenuItems, así que se actualiza solo
 * después de cada mutación (todas invalidan qk.admin).
 */
export function OptionGroupEditor({ restaurantId, menuItemId }: OptionGroupEditorProps) {
  const items = useAdminMenuItems(restaurantId)
  const m = useMenuAdminMutations(restaurantId)
  const groups = (items.data?.find((i) => i.id === menuItemId)?.optionGroups ?? []).slice().sort((a, b) => a.name.localeCompare(b.name))
  const [newGroupName, setNewGroupName] = useState('')

  const addGroup = () => {
    const name = newGroupName.trim()
    if (!name) return
    m.saveOptionGroup.mutate({ menuItemId, name, selection: 'single', required: false, minSelect: 0, maxSelect: null, sortOrder: groups.length })
    setNewGroupName('')
  }

  return (
    <div>
      <h3 className="text-sm font-semibold">Variantes (tamaño, extras…)</h3>
      <div className="mt-2 space-y-3">
        {groups.map((g, idx) => (
          <div key={g.id} className="rounded-xl bg-stone-50 p-3 ring-1 ring-stone-200/70">
            <div className="flex flex-wrap items-center gap-2">
              <input
                defaultValue={g.name}
                onBlur={(e) => {
                  const name = e.target.value.trim()
                  if (name && name !== g.name) m.saveOptionGroup.mutate({ id: g.id, menuItemId, name, selection: g.selection, required: g.required, minSelect: g.minSelect, maxSelect: g.maxSelect, sortOrder: idx })
                }}
                className={`${smallInputCls} min-w-0 flex-1 font-semibold`}
                aria-label="Nombre del grupo"
              />
              <select
                value={g.selection}
                onChange={(e) => {
                  const selection = e.target.value as OptionSelection
                  m.saveOptionGroup.mutate({ id: g.id, menuItemId, name: g.name, selection, required: g.required, minSelect: g.minSelect, maxSelect: g.maxSelect, sortOrder: idx })
                }}
                className={smallInputCls}
                aria-label="Tipo de selección"
              >
                <option value="single">Una opción</option>
                <option value="multiple">Varias opciones</option>
              </select>
              <label className="flex items-center gap-1.5 text-xs font-medium text-stone-600">
                <input
                  type="checkbox"
                  checked={g.required}
                  onChange={(e) =>
                    m.saveOptionGroup.mutate({ id: g.id, menuItemId, name: g.name, selection: g.selection, required: e.target.checked, minSelect: g.minSelect, maxSelect: g.maxSelect, sortOrder: idx })
                  }
                  className="h-4 w-4 accent-brand-500"
                />
                Obligatorio
              </label>
              {g.selection === 'multiple' && (
                <label className="flex items-center gap-1 text-xs font-medium text-stone-600">
                  Máx.
                  <input
                    type="number"
                    min={1}
                    defaultValue={g.maxSelect ?? ''}
                    placeholder="sin límite"
                    onBlur={(e) => {
                      const maxSelect = e.target.value ? Number(e.target.value) : null
                      m.saveOptionGroup.mutate({ id: g.id, menuItemId, name: g.name, selection: g.selection, required: g.required, minSelect: g.minSelect, maxSelect, sortOrder: idx })
                    }}
                    className={`${smallInputCls} w-16`}
                  />
                </label>
              )}
              <Button variant="ghost" size="sm" icon={<Trash2 size={14} />} onClick={() => m.deleteOptionGroup.mutate(g.id)} aria-label={`Eliminar grupo ${g.name}`} />
            </div>

            <ul className="mt-2 space-y-1.5">
              {[...g.options]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((o) => (
                  <li key={o.id} className="flex items-center gap-2">
                    <input
                      defaultValue={o.name}
                      onBlur={(e) => {
                        const name = e.target.value.trim()
                        if (name && name !== o.name) m.saveOption.mutate({ id: o.id, groupId: g.id, name, priceDelta: o.priceDelta, isAvailable: o.isAvailable, sortOrder: 0 })
                      }}
                      className={`${smallInputCls} min-w-0 flex-1`}
                      aria-label="Nombre de la opción"
                    />
                    <input
                      type="number"
                      step="0.01"
                      defaultValue={(o.priceDelta / 100).toFixed(2)}
                      onBlur={(e) => {
                        const priceDelta = Math.round(Number(e.target.value) * 100)
                        if (Number.isFinite(priceDelta) && priceDelta !== o.priceDelta) m.saveOption.mutate({ id: o.id, groupId: g.id, name: o.name, priceDelta, isAvailable: o.isAvailable, sortOrder: 0 })
                      }}
                      className={`${smallInputCls} w-20 text-right`}
                      aria-label={`Precio adicional de ${o.name}`}
                      title="Diferencia de precio (puede ser negativa)"
                    />
                    <button
                      type="button"
                      onClick={() => m.saveOption.mutate({ id: o.id, groupId: g.id, name: o.name, priceDelta: o.priceDelta, isAvailable: !o.isAvailable, sortOrder: 0 })}
                      className={`rounded-lg px-2 py-1 text-xs font-semibold ${o.isAvailable ? 'text-emerald-700' : 'text-stone-500'}`}
                    >
                      {o.isAvailable ? 'Disponible' : 'Agotada'}
                    </button>
                    <Button variant="ghost" size="sm" icon={<Trash2 size={13} />} onClick={() => m.deleteOption.mutate(o.id)} aria-label={`Eliminar ${o.name}`} />
                  </li>
                ))}
            </ul>

            <AddOptionRow onAdd={(name) => m.saveOption.mutate({ groupId: g.id, name, priceDelta: 0, isAvailable: true, sortOrder: g.options.length })} />
          </div>
        ))}
      </div>

      <div className="mt-2 flex gap-2">
        <input
          value={newGroupName}
          onChange={(e) => setNewGroupName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addGroup()}
          placeholder='Nuevo grupo (ej. "Tamaño")'
          className={`${smallInputCls} flex-1`}
        />
        <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={addGroup} disabled={!newGroupName.trim()}>
          Agregar grupo
        </Button>
      </div>
    </div>
  )
}

function AddOptionRow({ onAdd }: { onAdd: (name: string) => void }) {
  const [value, setValue] = useState('')
  const submit = () => {
    const name = value.trim()
    if (!name) return
    onAdd(name)
    setValue('')
  }
  return (
    <div className="mt-2 flex gap-2">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="Nueva opción…"
        className={`${smallInputCls} flex-1`}
      />
      <Button variant="ghost" size="sm" icon={<Plus size={14} />} onClick={submit} disabled={!value.trim()}>
        Agregar
      </Button>
    </div>
  )
}
