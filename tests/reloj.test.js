import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  diaEnOffset,
  diasEntreDias,
  instanteConfiable,
  diaNegocioPlausible,
  MS_TOLERANCIA_RELOJ,
  TZ_DESFASE_HORAS
} from '../shared/fechas.js'

/**
 * El problema real: Cuba decidió no aplicar el cambio de hora, pero muchos
 * teléfonos sí lo aplicaron y quedan una hora adelantados. Estas funciones son
 * la frontera donde eso deja de importar: el instante y el día de negocio los
 * decide el servidor, no el reloj del aparato.
 */

const HORA = 60 * 60 * 1000

describe('diaEnOffset: día de negocio con desfase fijo', () => {
  it('usa el desfase del negocio, no la zona del aparato', () => {
    // 2026-11-21 03:30 UTC = 2026-11-20 22:30 en UTC-5.
    const ms = Date.UTC(2026, 10, 21, 3, 30)
    assert.equal(diaEnOffset(ms), '2026-11-20')
  })

  it('cruza el día a medianoche local, no a medianoche UTC', () => {
    // 04:59 UTC = 23:59 local del 20; 05:00 UTC = 00:00 local del 21.
    assert.equal(diaEnOffset(Date.UTC(2026, 10, 21, 4, 59)), '2026-11-20')
    assert.equal(diaEnOffset(Date.UTC(2026, 10, 21, 5, 0)), '2026-11-21')
  })

  it('no depende del cambio de hora: el desfase es fijo todo el año', () => {
    const verano = Date.UTC(2026, 6, 15, 12, 0)
    const invierno = Date.UTC(2026, 0, 15, 12, 0)
    assert.equal(diaEnOffset(verano), diaEnOffset(verano + 0))
    assert.equal(diaEnOffset(invierno), '2026-01-15')
    // El desfase por defecto es el de Cuba (-5), sin DST.
    assert.equal(TZ_DESFASE_HORAS, -5)
  })

  it('acepta epoch, ISO y Date', () => {
    const ms = Date.UTC(2026, 10, 20, 20, 0)
    assert.equal(diaEnOffset(ms), '2026-11-20')
    assert.equal(diaEnOffset(new Date(ms)), '2026-11-20')
    assert.equal(diaEnOffset('2026-11-20T20:00:00.000Z'), '2026-11-20')
  })

  it('sin instante interpretable devuelve cadena vacía', () => {
    assert.equal(diaEnOffset(null), '')
    assert.equal(diaEnOffset(undefined), '')
    assert.equal(diaEnOffset('no es una fecha'), '')
  })
})

describe('diasEntreDias: aritmética de calendario', () => {
  it('cuenta días completos sin desfase de hora', () => {
    assert.equal(diasEntreDias('2026-11-21', '2026-11-20'), 1)
    assert.equal(diasEntreDias('2026-11-20', '2026-11-20'), 0)
    assert.equal(diasEntreDias('2026-11-19', '2026-11-20'), -1)
  })

  it('cruza meses y años', () => {
    assert.equal(diasEntreDias('2026-12-01', '2026-11-30'), 1)
    assert.equal(diasEntreDias('2027-01-01', '2026-12-31'), 1)
    assert.equal(diasEntreDias('2028-03-01', '2028-02-29'), 1)
  })

  it('con datos vacíos no inventa un número', () => {
    assert.ok(Number.isNaN(diasEntreDias('', '2026-11-20')))
    assert.ok(Number.isNaN(diasEntreDias('2026-11-20', null)))
  })
})

describe('instanteConfiable: el reloj del servidor manda', () => {
  const servidor = Date.UTC(2026, 10, 20, 18, 0)

  it('sin fecha del cliente usa la hora del servidor', () => {
    assert.deepEqual(instanteConfiable(null, servidor), { ms: servidor, ajustado: false, fueraDeTolerancia: false })
    assert.deepEqual(instanteConfiable(undefined, servidor), { ms: servidor, ajustado: false, fueraDeTolerancia: false })
  })

  it('una fecha pasada se respeta tal cual (la cola de voz la necesita)', () => {
    const ayer = servidor - 20 * HORA
    assert.deepEqual(instanteConfiable(ayer, servidor), { ms: ayer, ajustado: false, fueraDeTolerancia: false })
  })

  it('un minuto de gracia cubre el viaje de la petición', () => {
    const casiAhora = servidor + 30 * 1000
    assert.equal(instanteConfiable(casiAhora, servidor).ajustado, false)
  })

  it('una hora adelantado se recorta: nunca se fecha en el futuro', () => {
    // El caso real de Cuba: el teléfono va +1 h. Se acepta la venta, pero con
    // la hora del servidor (fecharla 1 h adelante corrompe el día de negocio).
    const adelantado = servidor + 1 * HORA
    const r = instanteConfiable(adelantado, servidor)
    assert.equal(r.ms, servidor)
    assert.equal(r.ajustado, true)
    assert.equal(r.fueraDeTolerancia, false)
  })

  it('justo en la tolerancia se recorta; un minuto más se marca fuera', () => {
    const enLimite = instanteConfiable(servidor + MS_TOLERANCIA_RELOJ, servidor)
    assert.equal(enLimite.ajustado, true)
    assert.equal(enLimite.fueraDeTolerancia, false)

    const fuera = instanteConfiable(servidor + MS_TOLERANCIA_RELOJ + 60 * 1000, servidor)
    assert.equal(fuera.ajustado, true)
    assert.equal(fuera.fueraDeTolerancia, true)
    assert.equal(fuera.ms, servidor)
  })

  it('un reloj muy adelantado nunca devuelve un instante futuro', () => {
    const r = instanteConfiable(servidor + 30 * 24 * HORA, servidor)
    assert.equal(r.fueraDeTolerancia, true)
    assert.ok(r.ms <= servidor)
  })
})

describe('diaNegocioPlausible: fechas sin hora', () => {
  // 2026-11-21 02:00 UTC = 21:00 local del 20.
  const servidor = Date.UTC(2026, 10, 21, 2, 0)

  it('hoy y ayer son válidos', () => {
    assert.equal(diaNegocioPlausible('2026-11-20', servidor).ok, true)
    assert.equal(diaNegocioPlausible('2026-11-19', servidor).ok, true)
  })

  it('un día por delante se acepta (el equipo cruzó de día antes) y se corrige', () => {
    const r = diaNegocioPlausible('2026-11-21', servidor)
    assert.equal(r.ok, false)
    assert.equal(r.diaAjustado, '2026-11-20')
    assert.match(r.motivo, /adelantada un día/)
  })

  it('dos días por delante es un reloj roto: no se corrige en silencio', () => {
    const r = diaNegocioPlausible('2026-11-22', servidor)
    assert.equal(r.ok, false)
    assert.equal(r.diaAjustado, null)
    assert.match(r.motivo, /futuro/)
  })

  it('una compra vieja es válida: el jefe puede anotarla tarde', () => {
    const r = diaNegocioPlausible('2026-01-01', servidor)
    assert.equal(r.ok, true)
    assert.equal(r.diaAjustado, null)
  })

  it('una fecha inválida no se convierte en hoy por accidente', () => {
    const r = diaNegocioPlausible('', servidor)
    assert.equal(r.ok, false)
    assert.match(r.motivo, /inválida/)
  })
})
