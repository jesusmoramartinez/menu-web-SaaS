import { useMutation } from '@tanstack/react-query'
import { ChefHat, Pizza, Store, UserPlus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Button } from '@/components/ui/Button'
import { roleHome } from '@/features/staff/roleHome'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { toAppError } from '@/lib/errors'
import { slugify } from '@/lib/slugify'
import { createRestaurant, joinRestaurant, signUpWithPassword } from '@/services/auth'
import type { StaffRole } from '@/types/domain'
import { ConfirmEmailNotice } from './ConfirmEmailNotice'
import { consumePendingSetup, savePendingSetup } from './pendingSetup'

const inputCls =
  'w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20'

type Mode = 'invite' | 'restaurant'

/** Alta de personal: canjear un código de invitación, o crear un restaurante nuevo (dueño). */
export default function RegisterPage() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const consumingRef = useRef(false)

  const [mode, setMode] = useState<Mode>('invite')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [confirmingEmail, setConfirmingEmail] = useState<string | null>(null)

  const tryConsume = async () => {
    if (consumingRef.current) return null
    consumingRef.current = true
    try {
      return await consumePendingSetup()
    } finally {
      consumingRef.current = false
    }
  }

  // Volvió del link de confirmación: ya hay sesión, terminamos el alta que había quedado pendiente.
  useEffect(() => {
    if (loading || !session) return
    void tryConsume().then((result) => {
      if (result) navigate(roleHome(result.role as StaffRole), { replace: true })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, session])

  const submitInvite = useMutation({
    mutationFn: async () => {
      if (session) {
        const r = await joinRestaurant(code.trim().toUpperCase(), displayName.trim())
        return { role: r.role, needsConfirmation: false }
      }
      savePendingSetup({ type: 'invite', code: code.trim().toUpperCase(), displayName: displayName.trim() })
      const { session: newSession } = await signUpWithPassword(email.trim(), password, `${window.location.origin}/registro`)
      if (!newSession) return { role: null, needsConfirmation: true }
      const result = await tryConsume()
      return { role: result?.role ?? null, needsConfirmation: false }
    },
    onSuccess: ({ role, needsConfirmation }) => {
      if (needsConfirmation) setConfirmingEmail(email.trim())
      else if (role) navigate(roleHome(role as StaffRole), { replace: true })
    },
    onError: (err) => toast.show(toAppError(err).message, 'error'),
  })

  const submitRestaurant = useMutation({
    mutationFn: async () => {
      const finalSlug = slug || slugify(name)
      if (session) {
        await createRestaurant(name.trim(), finalSlug)
        return { needsConfirmation: false }
      }
      savePendingSetup({ type: 'restaurant', name: name.trim(), slug: finalSlug })
      const { session: newSession } = await signUpWithPassword(email.trim(), password, `${window.location.origin}/registro`)
      if (!newSession) return { needsConfirmation: true }
      await tryConsume()
      return { needsConfirmation: false }
    },
    onSuccess: ({ needsConfirmation }) => {
      if (needsConfirmation) setConfirmingEmail(email.trim())
      else navigate('/mozo', { replace: true })
    },
    onError: (err) => toast.show(toAppError(err).message, 'error'),
  })

  if (confirmingEmail) return <ConfirmEmailNotice email={confirmingEmail} />

  const busy = submitInvite.isPending || submitRestaurant.isPending
  const error = submitInvite.error
    ? toAppError(submitInvite.error).message
    : submitRestaurant.error
      ? toAppError(submitRestaurant.error).message
      : null

  return (
    <div className="flex min-h-dvh items-center justify-center bg-stone-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500 text-white">
            <Pizza size={22} aria-hidden="true" />
          </span>
          <h1 className="mt-3 text-xl font-bold">Crear cuenta</h1>
        </div>

        <div className="mb-4 flex gap-1 rounded-xl bg-stone-200/70 p-1" role="tablist" aria-label="Tipo de alta">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'invite'}
            onClick={() => setMode('invite')}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition ${mode === 'invite' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'}`}
          >
            <UserPlus size={15} aria-hidden="true" /> Tengo un código
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'restaurant'}
            onClick={() => setMode('restaurant')}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition ${mode === 'restaurant' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'}`}
          >
            <Store size={15} aria-hidden="true" /> Crear mi restaurante
          </button>
        </div>

        {mode === 'invite' ? (
          <form
            className="space-y-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200/70"
            onSubmit={(e) => {
              e.preventDefault()
              submitInvite.mutate()
            }}
          >
            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                {error}
              </p>
            )}
            <label className="block">
              <span className="text-sm font-semibold">Código de invitación</span>
              <input
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Ej: 7K3PQ9XZ"
                className={`mt-1 ${inputCls} uppercase`}
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold">Tu nombre</span>
              <input
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Como te va a ver el equipo"
                className={`mt-1 ${inputCls}`}
              />
            </label>
            {!session && (
              <>
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
                    minLength={6}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`mt-1 ${inputCls}`}
                  />
                </label>
              </>
            )}
            <Button type="submit" full size="lg" icon={<UserPlus size={18} />} disabled={busy} className="mt-2">
              {busy ? 'Creando cuenta…' : 'Unirme al equipo'}
            </Button>
          </form>
        ) : (
          <form
            className="space-y-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200/70"
            onSubmit={(e) => {
              e.preventDefault()
              submitRestaurant.mutate()
            }}
          >
            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                {error}
              </p>
            )}
            <label className="block">
              <span className="text-sm font-semibold">Nombre del restaurante</span>
              <input
                required
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  if (!slugTouched) setSlug(slugify(e.target.value))
                }}
                placeholder="Pizzería Don Remolo"
                className={`mt-1 ${inputCls}`}
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold">Dirección (para el QR)</span>
              <div className="mt-1 flex items-center overflow-hidden rounded-xl border border-stone-200 bg-white focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20">
                <span className="pl-3 text-sm text-stone-500">/r/</span>
                <input
                  required
                  value={slug}
                  onChange={(e) => {
                    setSlugTouched(true)
                    setSlug(slugify(e.target.value))
                  }}
                  className="w-full px-1 py-2.5 text-sm outline-none"
                />
              </div>
            </label>
            {!session && (
              <>
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
                    minLength={6}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`mt-1 ${inputCls}`}
                  />
                </label>
              </>
            )}
            <Button type="submit" full size="lg" icon={<ChefHat size={18} />} disabled={busy} className="mt-2">
              {busy ? 'Creando…' : 'Crear restaurante'}
            </Button>
          </form>
        )}

        <p className="mt-4 text-center text-sm text-stone-600">
          ¿Ya tenés cuenta?{' '}
          <Link to="/login" className="font-semibold text-brand-700 hover:underline">
            Iniciá sesión
          </Link>
        </p>
        <p className="mt-2 text-center text-xs text-stone-500">
          <Link to="/" className="hover:underline">
            ← Volver al inicio
          </Link>
        </p>
      </div>
    </div>
  )
}

