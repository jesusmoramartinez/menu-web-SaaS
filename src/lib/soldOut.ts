/**
 * `menu_items.sold_out_until` es un **instante** ("agotado hasta"), no una fecha: lo
 * calcula el servidor con la zona horaria del restaurante (ver la migración
 * `20261004000100_sold_out_timezone.sql`).
 *
 * Antes era un `date` comparado en UTC, y como la fecha UTC cambia a las 21:00 en
 * Argentina, un plato marcado agotado a las 19:00 volvía a aparecer disponible en plena
 * cena. Comparando instantes el problema desaparece y no hace falta ninguna cuenta de
 * fechas ni de zonas horarias en el cliente.
 */
export function isSoldOut(soldOutUntil: string | null | undefined, now: number = Date.now()): boolean {
  if (!soldOutUntil) return false
  const until = new Date(soldOutUntil).getTime()
  return Number.isFinite(until) && until > now
}
