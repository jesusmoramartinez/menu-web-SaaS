import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChefHat, LayoutDashboard, RotateCcw, Smartphone, UserRound, type LucideIcon } from 'lucide-react'
import { NavLink } from 'react-router'
import { useRestaurantScope } from '@/features/staff/useRestaurantScope'
import { useActiveOrders, useOpenAlerts } from '@/hooks/useQueries'
import { useToast } from '@/hooks/useToast'
import { toAppError } from '@/lib/errors'
import { DEMO_CLIENT_PATH, DEMO_TABLE_TOKEN, resetDemo } from '@/services/demo'
import { storageKeys } from '@/features/client/client-context'

const VIEWS: { to: string; label: string; Icon: LucideIcon; badge: 'waiter' | 'kitchen' | null }[] = [
  { to: DEMO_CLIENT_PATH, label: 'Cliente', Icon: Smartphone, badge: null },
  { to: '/demo/mozo', label: 'Mozo', Icon: UserRound, badge: 'waiter' },
  { to: '/demo/cocina', label: 'Cocina', Icon: ChefHat, badge: 'kitchen' },
  { to: '/demo/admin', label: 'Admin', Icon: LayoutDashboard, badge: null },
]

/** Barra superior de la DEMO para alternar entre los tres roles en un mismo navegador. */
export function DemoBar() {
  const { restaurant } = useRestaurantScope()
  const orders = useActiveOrders(restaurant.id)
  const alerts = useOpenAlerts(restaurant.id)
  const toast = useToast()
  const queryClient = useQueryClient()

  const badges = {
    waiter: (orders.data?.filter((o) => o.status === 'pending' || o.status === 'ready').length ?? 0) + (alerts.data?.length ?? 0),
    kitchen: orders.data?.filter((o) => o.status === 'kitchen').length ?? 0,
  }

  const reset = useMutation({
    mutationFn: resetDemo,
    onSuccess: async () => {
      localStorage.removeItem(storageKeys.session(DEMO_TABLE_TOKEN))
      localStorage.removeItem(storageKeys.cart(DEMO_TABLE_TOKEN))
      await queryClient.invalidateQueries()
      toast.show('Demo reiniciada', 'info')
    },
    onError: (err) => toast.show(toAppError(err, 'No se pudo reiniciar la demo.').message, 'error'),
  })

  return (
    <div className="sticky top-0 z-40 bg-stone-900 text-white shadow-md">
      <div className="mx-auto flex max-w-staff items-center gap-2 px-3 py-2">
        <span className="hidden text-xs font-semibold uppercase tracking-wider text-stone-400 sm:block">Demo</span>

        <nav className="flex flex-1 gap-1 rounded-xl bg-stone-800 p-1" aria-label="Vistas de la demo">
          {VIEWS.map(({ to, label, Icon, badge }) => {
            const count = badge ? badges[badge] : 0
            return (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `relative flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium transition
                  ${isActive ? 'bg-brand-500 text-white shadow' : 'text-stone-300 hover:bg-stone-700'}`
                }
              >
                <Icon size={16} aria-hidden="true" />
                <span>{label}</span>
                {count > 0 && (
                  <span
                    className="absolute -top-1.5 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white ring-2 ring-stone-900"
                    aria-label={`${count} pendientes`}
                  >
                    {count}
                  </span>
                )}
              </NavLink>
            )
          })}
        </nav>

        <button
          type="button"
          onClick={() => reset.mutate()}
          disabled={reset.isPending}
          title="Reiniciar demo"
          aria-label="Reiniciar demo"
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-stone-300 transition hover:bg-stone-800 hover:text-white disabled:opacity-50"
        >
          <RotateCcw size={16} className={reset.isPending ? 'animate-spin' : ''} />
        </button>
      </div>
    </div>
  )
}
