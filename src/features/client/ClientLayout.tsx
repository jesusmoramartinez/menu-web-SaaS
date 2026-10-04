import { QrCode } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { ErrorState } from '@/components/ui/ErrorState'
import { MenuSkeleton, Skeleton } from '@/components/ui/Skeleton'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useTableByToken } from '@/hooks/useQueries'
import { brandStyle } from '@/lib/brandStyle'
import { ClientProvider } from './ClientProvider'
import ClientView from './ClientView'

interface ClientLayoutProps {
  /** slug fijo (ruta demo); si no, se toma de la URL */
  slug?: string
}

/** Ruta /r/:slug/m/:tableToken (y /demo/m/:tableToken): resuelve la mesa y monta la vista del comensal. */
export default function ClientLayout({ slug: fixedSlug }: ClientLayoutProps) {
  const params = useParams<{ slug?: string; tableToken: string }>()
  const token = params.tableToken ?? ''
  const slug = fixedSlug ?? params.slug ?? ''
  const query = useTableByToken(token)
  useDocumentTitle(query.data ? `${query.data.restaurant.name} · Menú Digital` : undefined)

  if (query.isPending) {
    return (
      <div className="min-h-dvh" aria-busy="true">
        <div className="bg-stone-300 px-4 pt-5 pb-4">
          <div className="mx-auto max-w-client space-y-3">
            <Skeleton className="h-12 w-2/3 bg-stone-400/40" />
            <Skeleton className="h-10 w-full bg-stone-400/40" />
          </div>
        </div>
        <div className="mx-auto max-w-client px-4 py-4">
          <MenuSkeleton />
        </div>
      </div>
    )
  }

  if (query.isError) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <ErrorState error={query.error} onRetry={() => query.refetch()} title="No pudimos cargar la mesa" />
      </div>
    )
  }

  const table = query.data
  if (!table || table.restaurant.slug !== slug) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-stone-200 text-stone-500">
          <QrCode size={28} aria-hidden="true" />
        </div>
        <h1 className="mt-4 text-2xl font-bold">Mesa no encontrada</h1>
        <p className="mt-2 max-w-sm text-stone-600">
          Este código QR no corresponde a ninguna mesa activa. Pedile al personal uno actualizado.
        </p>
        <Link to="/" className="mt-6 text-sm font-semibold text-brand-700 hover:underline">
          Ir al inicio
        </Link>
      </div>
    )
  }

  return (
    <div style={brandStyle(table.restaurant.theme.brand)}>
      <ClientProvider key={token} token={token} table={table}>
        <ClientView />
      </ClientProvider>
    </div>
  )
}
