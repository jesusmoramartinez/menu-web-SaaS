import { Minus, Plus } from 'lucide-react'

interface QtyControlProps {
  qty: number
  onChange: (qty: number) => void
  size?: 'sm' | 'md'
  min?: number
}

export function QtyControl({ qty, onChange, size = 'md', min = 0 }: QtyControlProps) {
  // 44px en `md` (objetivo de toque recomendado) y 36px en `sm`, donde se usa dentro de
  // listas densas. Antes eran 36 y 28: se fallaba el toque seguido, y es uno de los
  // controles que más se usan (carrito del comensal, mozo editando una comanda parado).
  const compact = size === 'sm'
  const btn = `${compact ? 'h-9 w-9' : 'h-11 w-11'} flex shrink-0 items-center justify-center rounded-full text-stone-700 transition hover:bg-stone-100 disabled:opacity-30`
  return (
    <div className="inline-flex items-center rounded-full bg-white ring-1 ring-stone-300">
      <button type="button" onClick={() => onChange(qty - 1)} disabled={qty <= min} className={btn} aria-label="Menos">
        <Minus size={compact ? 14 : 18} />
      </button>
      <span className="min-w-8 text-center text-sm font-bold tabular-nums" aria-live="polite">
        {qty}
      </span>
      <button type="button" onClick={() => onChange(qty + 1)} className={btn} aria-label="Más">
        <Plus size={compact ? 14 : 18} />
      </button>
    </div>
  )
}
