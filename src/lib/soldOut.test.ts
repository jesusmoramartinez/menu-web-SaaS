import { describe, expect, it } from 'vitest'
import { isSoldOut } from './soldOut'

describe('isSoldOut', () => {
  it('sin fecha, el plato está disponible', () => {
    expect(isSoldOut(null)).toBe(false)
    expect(isSoldOut(undefined)).toBe(false)
    expect(isSoldOut('')).toBe(false)
  })

  it('agotado mientras el instante esté en el futuro', () => {
    const now = Date.parse('2026-10-04T22:00:00Z')
    expect(isSoldOut('2026-10-05T09:00:00Z', now)).toBe(true)
    expect(isSoldOut('2026-10-04T21:59:59Z', now)).toBe(false)
  })

  /**
   * El caso que motivó el cambio: el 21:00 ART (medianoche UTC) un plato marcado
   * "agotado hoy" a las 19:00 reaparecía en el menú, en pleno servicio. Con la semántica
   * de instante (agotado hasta el próximo 06:00 local), cruzar las 21:00 no cambia nada.
   */
  it('cruzar las 21:00 ART (cambio de fecha UTC) no desmarca el plato', () => {
    // Marcado el martes a las 19:00 ART → agotado hasta el miércoles 06:00 ART
    const until = '2026-10-07T09:00:00Z' // miércoles 06:00 ART = 09:00 UTC

    const antes = Date.parse('2026-10-06T23:59:00Z') // martes 20:59 ART
    const despues = Date.parse('2026-10-07T00:01:00Z') // martes 21:01 ART, ya es miércoles en UTC

    expect(isSoldOut(until, antes)).toBe(true)
    expect(isSoldOut(until, despues)).toBe(true) // ← antes del fix acá daba false

    // Y a la mañana siguiente, pasado el corte, vuelve a estar disponible solo
    expect(isSoldOut(until, Date.parse('2026-10-07T09:00:01Z'))).toBe(false)
  })

  it('ignora una fecha inválida en vez de romper', () => {
    expect(isSoldOut('no-es-una-fecha')).toBe(false)
  })
})
