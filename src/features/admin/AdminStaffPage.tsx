import { Check, ChevronDown, ChevronUp, Copy, Plus, Trash2, UserRound } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { CardsSkeleton } from '@/components/ui/Skeleton'
import { useRestaurantScope } from '@/features/staff/useRestaurantScope'
import { useStaffAdminMutations } from '@/hooks/useAdminMutations'
import { useAdminTables, useAllAssignments, useInvites, useSectors, useStaffList } from '@/hooks/useAdminQueries'
import { useToast } from '@/hooks/useToast'
import { timeUntil } from '@/lib/format'
import type { StaffRole } from '@/types/domain'

const ROLE_LABEL: Record<StaffRole, string> = { owner: 'Dueño/a', admin: 'Administración', waiter: 'Mozo', kitchen: 'Cocina' }
const ASSIGNABLE_ROLES: Exclude<StaffRole, 'owner'>[] = ['admin', 'waiter', 'kitchen']

export default function AdminStaffPage() {
  const { restaurant, staffId } = useRestaurantScope()
  const staff = useStaffList(restaurant.id)
  const invites = useInvites(restaurant.id)
  const sectors = useSectors(restaurant.id)
  const tables = useAdminTables(restaurant.id)
  const assignments = useAllAssignments(restaurant.id)
  const m = useStaffAdminMutations(restaurant.id)
  const toast = useToast()

  const [expandedStaffId, setExpandedStaffId] = useState<string | null>(null)
  const [inviteRole, setInviteRole] = useState<Exclude<StaffRole, 'owner'>>('waiter')
  const [inviteEmail, setInviteEmail] = useState('')
  const [lastCode, setLastCode] = useState<string | null>(null)

  if (staff.isPending || invites.isPending || sectors.isPending || tables.isPending || assignments.isPending) return <CardsSkeleton count={3} />
  if (staff.isError) return <ErrorState error={staff.error} onRetry={() => staff.refetch()} title="No pudimos cargar el personal" />

  const staffList = staff.data
  const generateInvite = () => {
    m.createInvite.mutate({ role: inviteRole, email: inviteEmail.trim() || null }, { onSuccess: (invite) => setLastCode(invite.code) })
    setInviteEmail('')
  }
  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      toast.show('Código copiado', 'info')
    } catch {
      toast.show(code, 'info')
    }
  }

  return (
    <div className="space-y-8">
      <section aria-labelledby="staff-title">
        <h2 id="staff-title" className="mb-3 text-lg font-bold">
          Equipo
        </h2>
        {staffList.length === 0 ? (
          <EmptyState icon={UserRound} title="Todavía no hay nadie más en el equipo" subtitle="Generá una invitación más abajo." />
        ) : (
          <ul className="space-y-2">
            {staffList.map((s) => {
              const isSelf = s.id === staffId
              const expanded = expandedStaffId === s.id
              return (
                <li key={s.id} className="rounded-xl bg-white ring-1 ring-stone-200/70">
                  <div className="flex flex-wrap items-center gap-2 p-3">
                    <div className="min-w-0 flex-1">
                      <p className={`font-semibold ${s.isActive ? '' : 'text-stone-500 line-through'}`}>
                        {s.displayName} {isSelf && <span className="text-xs font-normal text-stone-500">(vos)</span>}
                      </p>
                    </div>
                    {s.role === 'owner' ? (
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">Dueño/a</span>
                    ) : (
                      <select
                        value={s.role}
                        disabled={isSelf}
                        onChange={(e) => m.updateRole.mutate({ id: s.id, role: e.target.value as Exclude<StaffRole, 'owner'> })}
                        className="rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm disabled:opacity-50"
                      >
                        {ASSIGNABLE_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </select>
                    )}
                    {s.role !== 'owner' && (
                      <Button variant="ghost" size="sm" disabled={isSelf} onClick={() => m.setActive.mutate({ id: s.id, isActive: !s.isActive })}>
                        {s.isActive ? 'Activo' : 'Inactivo'}
                      </Button>
                    )}
                    {s.role === 'waiter' && (
                      <Button variant="ghost" size="sm" icon={expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />} onClick={() => setExpandedStaffId(expanded ? null : s.id)}>
                        Mesas
                      </Button>
                    )}
                  </div>
                  {expanded && (
                    <AssignmentEditor
                      sectors={sectors.data ?? []}
                      tables={tables.data ?? []}
                      current={(assignments.data ?? []).filter((a) => a.staffId === s.id)}
                      onSave={(sectorIds, tableIds) => m.saveAssignments.mutate({ staffId: s.id, sectorIds, tableIds }, { onSuccess: () => setExpandedStaffId(null) })}
                      saving={m.saveAssignments.isPending}
                    />
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="invites-title">
        <h2 id="invites-title" className="mb-3 text-lg font-bold">
          Invitaciones
        </h2>
        <div className="flex flex-wrap items-end gap-2 rounded-xl bg-white p-3 ring-1 ring-stone-200/70">
          <label className="block">
            <span className="block text-xs font-semibold text-stone-500">Rol</span>
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Exclude<StaffRole, 'owner'>)} className="mt-1 rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm">
              {ASSIGNABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </label>
          <label className="block flex-1">
            <span className="block text-xs font-semibold text-stone-500">Email (opcional, restringe quién lo puede usar)</span>
            <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} type="email" placeholder="mozo@ejemplo.com" className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm" />
          </label>
          <Button icon={<Plus size={16} />} onClick={generateInvite} disabled={m.createInvite.isPending}>
            Generar código
          </Button>
        </div>

        {lastCode && (
          <div className="mt-2 flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2 ring-1 ring-emerald-200">
            <p className="text-sm text-emerald-900">
              Código nuevo: <span className="font-mono text-base font-bold">{lastCode}</span> — compartilo con la persona para que se registre en <code>/registro</code>.
            </p>
            <button type="button" onClick={() => void copyCode(lastCode)} className="rounded-lg p-1.5 text-emerald-700 hover:bg-emerald-100" aria-label="Copiar código">
              <Copy size={16} />
            </button>
          </div>
        )}

        {invites.data && invites.data.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {invites.data.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-2.5 text-sm ring-1 ring-stone-200/70">
                <span className="font-mono font-bold">{i.code}</span>
                <span className="text-stone-500">{ROLE_LABEL[i.role]}</span>
                {i.email && <span className="text-stone-500">{i.email}</span>}
                <span className="ml-auto text-xs text-stone-500">
                  {i.usedAt ? (
                    <span className="flex items-center gap-1 text-emerald-600">
                      <Check size={12} /> Usado
                    </span>
                  ) : (
                    `vence ${timeUntil(new Date(i.expiresAt).getTime())}`
                  )}
                </span>
                {!i.usedAt && (
                  <Button variant="ghost" size="sm" icon={<Trash2 size={13} />} onClick={() => m.deleteInvite.mutate(i.id)} aria-label="Revocar invitación" />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function AssignmentEditor({
  sectors,
  tables,
  current,
  onSave,
  saving,
}: {
  sectors: { id: string; name: string }[]
  tables: { id: string; number: number; label: string | null; sectorId: string | null }[]
  current: { sectorId: string | null; tableId: string | null }[]
  onSave: (sectorIds: string[], tableIds: string[]) => void
  saving: boolean
}) {
  const [sectorIds, setSectorIds] = useState<string[]>(() => current.filter((a) => a.sectorId).map((a) => a.sectorId as string))
  const [tableIds, setTableIds] = useState<string[]>(() => current.filter((a) => a.tableId).map((a) => a.tableId as string))

  const toggle = (list: string[], setList: (v: string[]) => void, id: string) => setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

  return (
    <div className="border-t border-stone-100 p-3">
      <p className="mb-2 text-xs text-stone-500">Sin nada marcado, el mozo ve todas las mesas. Marcá sectores completos y/o mesas puntuales.</p>
      {sectors.length > 0 && (
        <div className="mb-2">
          <p className="text-xs font-semibold text-stone-600">Sectores</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {sectors.map((s) => (
              <label key={s.id} className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ring-1 ${sectorIds.includes(s.id) ? 'bg-brand-50 ring-brand-300' : 'bg-white ring-stone-200'}`}>
                <input type="checkbox" checked={sectorIds.includes(s.id)} onChange={() => toggle(sectorIds, setSectorIds, s.id)} className="h-3.5 w-3.5 accent-brand-500" />
                {s.name}
              </label>
            ))}
          </div>
        </div>
      )}
      {tables.length > 0 && (
        <div className="mb-2">
          <p className="text-xs font-semibold text-stone-600">Mesas puntuales</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {tables.map((t) => (
              <label key={t.id} className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ring-1 ${tableIds.includes(t.id) ? 'bg-brand-50 ring-brand-300' : 'bg-white ring-stone-200'}`}>
                <input type="checkbox" checked={tableIds.includes(t.id)} onChange={() => toggle(tableIds, setTableIds, t.id)} className="h-3.5 w-3.5 accent-brand-500" />
                {t.label ?? t.number}
              </label>
            ))}
          </div>
        </div>
      )}
      <Button size="sm" onClick={() => onSave(sectorIds, tableIds)} disabled={saving}>
        Guardar asignación
      </Button>
    </div>
  )
}
