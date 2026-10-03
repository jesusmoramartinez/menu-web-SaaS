import { Search, X } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Category } from '@/types/domain'

export type CategoryFilter = 'all' | string

interface MenuFiltersProps {
  categories: Category[]
  category: CategoryFilter
  onCategory: (c: CategoryFilter) => void
  query: string
  onQuery: (q: string) => void
}

/** Buscador + chips de categoría (el contenedor sticky lo pone la vista). */
export function MenuFilters({ categories, category, onCategory, query, onQuery }: MenuFiltersProps) {
  return (
    <div className="mx-auto max-w-client px-4 py-3">
      <label className="relative block">
        <span className="sr-only">Buscar platos</span>
        <Search size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-stone-500" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Buscar platos, ingredientes…"
          className="w-full rounded-xl border border-stone-200 bg-white py-2.5 pr-9 pl-10 text-sm shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        />
        {query && (
          <button
            type="button"
            onClick={() => onQuery('')}
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-1 text-stone-500 hover:bg-stone-100"
            aria-label="Limpiar búsqueda"
          >
            <X size={16} />
          </button>
        )}
      </label>

      <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4" role="tablist" aria-label="Categorías">
        <CategoryChip active={category === 'all'} onClick={() => onCategory('all')}>
          ✨ Todo
        </CategoryChip>
        {categories.map((c) => (
          <CategoryChip key={c.id} active={category === c.id} onClick={() => onCategory(c.id)}>
            {c.emoji ? `${c.emoji} ` : ''}
            {c.name}
          </CategoryChip>
        ))}
      </div>
    </div>
  )
}

function CategoryChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium whitespace-nowrap transition active:scale-95
        ${active ? 'bg-stone-900 text-white shadow' : 'bg-white text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50'}`}
    >
      {children}
    </button>
  )
}
