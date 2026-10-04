import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'dangerSolid' | 'ghost' | 'dark'
export type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
  /** ocupa todo el ancho disponible */
  full?: boolean
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand-500 text-white shadow-sm hover:bg-brand-600',
  secondary: 'bg-white text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50',
  success: 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700',
  danger: 'bg-white text-red-600 ring-1 ring-red-200 hover:bg-red-50',
  dangerSolid: 'bg-red-600 text-white shadow-sm hover:bg-red-700',
  ghost: 'text-stone-600 hover:bg-stone-100',
  dark: 'bg-stone-900 text-white hover:bg-stone-800',
}

/**
 * `min-h` explícito además del padding: sin él, `sm` quedaba en ~30px y `md` en ~38px, por
 * debajo de los 44px recomendados para un control que se toca con el dedo. `sm` se reserva
 * para controles secundarios densos (36px); las acciones principales usan `md`.
 */
const SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-3 py-1.5 text-sm rounded-lg',
  md: 'min-h-11 px-4 py-2.5 text-sm rounded-xl',
  lg: 'min-h-12 px-5 py-3 text-base rounded-xl',
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  full,
  className = '',
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-1.5 font-semibold whitespace-nowrap transition
        active:scale-95 disabled:pointer-events-none disabled:opacity-40
        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500
        ${VARIANTS[variant]} ${SIZES[size]} ${full ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </button>
  )
}
