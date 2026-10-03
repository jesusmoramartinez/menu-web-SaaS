import { useMutation } from '@tanstack/react-query'
import { LogIn, Pizza } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/hooks/useAuth'
import { toAppError } from '@/lib/errors'
import { signInWithPassword } from '@/services/auth'

const inputCls =
  'w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20'

/** Login del personal: email + contraseña. */
export default function LoginPage() {
  const { session, loading } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const from = (location.state as { from?: string } | null)?.from ?? '/mozo'

  const login = useMutation({
    mutationFn: () => signInWithPassword(email.trim(), password),
    onSuccess: () => navigate(from, { replace: true }),
  })

  // Ya hay sesión (o se acaba de crear): no tiene sentido mostrar el form de nuevo.
  if (!loading && session) return <Navigate to={from} replace />

  const error = login.error ? toAppError(login.error).message : null

  return (
    <div className="flex min-h-dvh items-center justify-center bg-stone-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500 text-white">
            <Pizza size={22} aria-hidden="true" />
          </span>
          <h1 className="mt-3 text-xl font-bold">Ingresar</h1>
          <p className="mt-1 text-sm text-stone-500">Panel de mozo, cocina y administración</p>
        </div>

        <form
          className="space-y-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200/70"
          onSubmit={(e) => {
            e.preventDefault()
            login.mutate()
          }}
        >
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {error}
            </p>
          )}

          <label className="block">
            <span className="text-sm font-semibold">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`mt-1 ${inputCls}`}
            />
          </label>

          <label className="block">
            <span className="text-sm font-semibold">Contraseña</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`mt-1 ${inputCls}`}
            />
          </label>

          <Button type="submit" full size="lg" icon={<LogIn size={18} />} disabled={login.isPending} className="mt-2">
            {login.isPending ? 'Ingresando…' : 'Ingresar'}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-stone-600">
          ¿No tenés cuenta todavía?{' '}
          <Link to="/registro" className="font-semibold text-brand-700 hover:underline">
            Registrate
          </Link>
        </p>
        <p className="mt-2 text-center text-xs text-stone-600">
          <Link to="/" className="hover:underline">
            ← Volver al inicio
          </Link>
        </p>
      </div>
    </div>
  )
}
