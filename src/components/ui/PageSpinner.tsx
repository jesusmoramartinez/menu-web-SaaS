import { Loader2 } from 'lucide-react'

export function PageSpinner({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="flex min-h-[50dvh] items-center justify-center text-stone-500" role="status" aria-live="polite">
      <Loader2 size={28} className="animate-spin" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </div>
  )
}
