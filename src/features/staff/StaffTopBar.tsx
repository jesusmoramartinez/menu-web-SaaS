import { useMutation } from '@tanstack/react-query'
import { ChefHat, LayoutDashboard, LogOut, UserRound } from 'lucide-react'
import { NavLink } from 'react-router'
import { useAuth } from '@/hooks/useAuth'
import type { Restaurant, Staff } from '@/types/domain'

const ROLE_LABEL: Record<Staff['role'], string> = {
  owner: 'Dueño/a',
  admin: 'Administración',
  waiter: 'Mozo',
  kitchen: 'Cocina',
}

/** Switch de vistas que ven owner/admin. */
const VIEWS = [
  { to: '/mozo', label: 'Mozo', Icon: UserRound },
  { to: '/cocina', label: 'Cocina', Icon: ChefHat },
  { to: '/admin', label: 'Admin', Icon: LayoutDashboard },
]

/** Barra superior de las rutas reales de staff: marca del restaurante, navegación entre pantallas + cerrar sesión. */
export function StaffTopBar({ staff, restaurant }: { staff: Staff; restaurant: Restaurant }) {
  const { signOut } = useAuth()
  const logout = useMutation({ mutationFn: signOut })
  const canSeeBoth = staff.role === 'owner' || staff.role === 'admin'

  return (
    <div className="sticky top-0 z-40 bg-stone-900 text-white shadow-md">
      <div className="mx-auto flex max-w-staff items-center gap-3 px-3 py-2">
        <div className="hidden min-w-0 items-center gap-2 sm:flex">
          {restaurant.logoUrl ? (
            <img src={restaurant.logoUrl} alt="" className="h-8 w-8 shrink-0 rounded-lg bg-white/90 object-cover" />
          ) : (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-sm font-bold" aria-hidden="true">
              {restaurant.name.charAt(0).toUpperCase()}
            </span>
          )}
          <span className="truncate font-bold">{restaurant.name}</span>
        </div>

        {canSeeBoth && (
          <nav className="flex shrink-0 gap-1 rounded-xl bg-stone-800 p-1" aria-label="Vistas">
            {VIEWS.map(({ to, label, Icon }) => (
              <NavLink
                key={to}
                to={to}
                title={label}
                aria-label={label}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition ${isActive ? 'bg-brand-500 text-white' : 'text-stone-300 hover:bg-stone-700'}`
                }
              >
                <Icon size={15} aria-hidden="true" />
                {/* Debajo de 420px las tres etiquetas + el nombre + cerrar sesión no caben y
                    empujarían la página. Quedan los íconos; el nombre va en title/aria-label. */}
                <span className="hidden xs:inline">{label}</span>
              </NavLink>
            ))}
          </nav>
        )}

        <div className="flex-1 truncate text-right text-xs text-stone-400 sm:text-sm">
          <span className="font-semibold text-white">{staff.displayName}</span> · {ROLE_LABEL[staff.role]}
        </div>

        <button
          type="button"
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
          title="Cerrar sesión"
          aria-label="Cerrar sesión"
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-stone-300 transition hover:bg-stone-800 hover:text-white disabled:opacity-50"
        >
          <LogOut size={16} />
        </button>
      </div>
    </div>
  )
}
