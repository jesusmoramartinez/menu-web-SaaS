import { Suspense } from 'react'
import { NavLink, Outlet } from 'react-router'
import { PageSpinner } from '@/components/ui/PageSpinner'
import { useRestaurantScope } from '@/features/staff/useRestaurantScope'
import { ADMIN_NAV } from './adminNav'

/**
 * Shell del panel admin: navegación por secciones + el restaurante activo.
 * Tabs horizontales en vez de sidebar clásica para que funcione bien a 360px
 * (el resto de la app usa el mismo patrón de tabs — ver ClientView/WaiterView).
 */
export default function AdminLayout() {
  const { restaurant } = useRestaurantScope()

  return (
    <div className="min-h-dvh bg-stone-50">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-admin px-4 py-4">
          <h1 className="text-xl font-bold">Administración</h1>
          <p className="text-sm text-stone-500">{restaurant.name}</p>
        </div>
        <nav className="mx-auto max-w-admin px-4 pb-3" aria-label="Secciones de administración">
          <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-xl bg-stone-200/70 p-1">
            {ADMIN_NAV.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold whitespace-nowrap transition ${
                    isActive ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'
                  }`
                }
              >
                <Icon size={16} aria-hidden="true" /> {label}
              </NavLink>
            ))}
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-admin px-4 py-5">
        <Suspense fallback={<PageSpinner />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  )
}
