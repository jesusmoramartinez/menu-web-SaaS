import { Volume2, VolumeX } from 'lucide-react'

interface SoundToggleProps {
  enabled: boolean
  onToggle: () => void
  /** true en headers de fondo oscuro (p. ej. la pantalla de cocina) */
  dark?: boolean
}

/** Prende/apaga el aviso sonoro de nuevas alertas/comandas (mozo y cocina). */
export function SoundToggle({ enabled, onToggle, dark }: SoundToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={enabled ? 'Silenciar avisos' : 'Activar avisos sonoros'}
      aria-label={enabled ? 'Silenciar avisos' : 'Activar avisos sonoros'}
      aria-pressed={enabled}
      className={`flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg transition ${
        dark ? 'text-stone-300 hover:bg-stone-800 hover:text-white' : 'text-stone-500 hover:bg-stone-100 hover:text-stone-700'
      }`}
    >
      {enabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
    </button>
  )
}
