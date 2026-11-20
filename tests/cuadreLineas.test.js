import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { cuadreItemSchema } from '../shared/schemas/cuadreItem.js'
import { cuadreSchema } from '../shared/schemas/cuadre.js'
import {
  claveLineaCuadre,
  deduplicarLineasCuadre
} from '../shared/inventario/lineasCuadre.js'
import { sincronizarLineas, payloadLinea, lineaCambio } from '../app/utils/cuadreSync.js'

const CUADRE = '188af40f-da3e-4668-8778-e1fe9a89797a'

function linea(extra = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    cuadreId: CUADRE,
    productoId: '22222222-2222-4222-8222-222222222222',
    loteId: null,
    precioVentaUsado: 10,
    cantidad: 1,
    subtotal: 10,
    tipoLinea: 'normal',
    nota: null,
    esExtra: false,
    secuencia: 1,
    creadoEn: 1000,
    ...extra
  }
}

/** Repo falso que registra llamadas y permite forzar errores. */
function apiFalsa({ crearFalla = false, actualizarFalla = false, eliminarFalla = false, idDevuelto } = {}) {
  const llamadas = { crear: [], actualizar: [], eliminar: [] }
  return {
    llamadas,
    crear: async (payload) => {
      llamadas.crear.push(payload)
      if (crearFalla) throw new Error('create boom')
      return { ...payload, id: idDevuelto ?? payload.id }
    },
    actualizar: async (id, cambios) => {
      llamadas.actualizar.push({ id, cambios })
      if (actualizarFalla) throw new Error('update boom')
      return { ...cambios, id }
    },
    eliminar: async (id) => {
      llamadas.eliminar.push(id)
      if (eliminarFalla) throw new Error('delete boom')
    }
  }
}

// --- esquemas -------------------------------------------------------------

describe('esquemas del cuadre conservan el id del cliente', () => {
  it('cuadreItemSchema conserva el id', () => {
    const r = cuadreItemSchema.safeParse(payloadLinea(linea(), CUADRE))
    assert.equal(r.success, true)
    assert.equal(r.data.id, linea().id)
  })

  it('cuadreSchema conserva el id', () => {
    const r = cuadreSchema.safeParse({
      id: CUADRE,
      fecha: '2026-11-19',
      estado: 'abierto'
    })
    assert.equal(r.success, true)
    assert.equal(r.data.id, CUADRE)
  })

  it('un id que no es uuid se rechaza', () => {
    const r = cuadreItemSchema.safeParse(payloadLinea(linea({ id: 'abc' }), CUADRE))
    assert.equal(r.success, false)
  })
})

// --- deduplicado ----------------------------------------------------------

describe('claveLineaCuadre', () => {
  it('dos líneas del mismo producto con distinta secuencia no colisionan', () => {
    const a = linea({ secuencia: 1 })
    const b = linea({ secuencia: 2 })
    assert.notEqual(claveLineaCuadre(a), claveLineaCuadre(b))
  })

  it('una línea extra del mismo producto no colisiona con la original', () => {
    assert.notEqual(
      claveLineaCuadre(linea({ esExtra: false })),
      claveLineaCuadre(linea({ esExtra: true }))
    )
  })

  it('un lote especial del mismo producto no colisiona con la original', () => {
    assert.notEqual(
      claveLineaCuadre(linea({ loteId: null })),
      claveLineaCuadre(linea({ loteId: '33333333-3333-4333-8333-333333333333' }))
    )
  })
})

describe('deduplicarLineasCuadre', () => {
  it('colapsa los dos juegos de ids distintos del fallo de 2026-11-19', () => {
    const viejo = linea({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', cantidad: 2, creadoEn: 1000 })
    const nuevo = linea({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', cantidad: 3, creadoEn: 2000 })
    const r = deduplicarLineasCuadre([viejo, nuevo])
    assert.equal(r.lineas.length, 1)
    assert.equal(r.lineas[0].id, nuevo.id)
    assert.equal(r.lineas[0].cantidad, 3)
    assert.deepEqual(r.descartadas.map(l => l.id), [viejo.id])
  })

  it('es determinista si las fechas coinciden (gana el id mayor)', () => {
    const a = linea({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', creadoEn: 1000 })
    const b = linea({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', creadoEn: 1000 })
    assert.equal(deduplicarLineasCuadre([a, b]).lineas[0].id, b.id)
    assert.equal(deduplicarLineasCuadre([b, a]).lineas[0].id, b.id)
  })

  it('sin creadoEn usa actualizadoEn', () => {
    const a = linea({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', creadoEn: undefined, actualizadoEn: 5000 })
    const b = linea({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', creadoEn: undefined, actualizadoEn: 1000 })
    assert.equal(deduplicarLineasCuadre([a, b]).lineas[0].id, a.id)
  })

  it('respeta líneas legítimas distintas del mismo producto', () => {
    const original = linea({ secuencia: 1 })
    const extra = linea({ id: '44444444-4444-4444-8444-444444444444', secuencia: 2 })
    const r = deduplicarLineasCuadre([original, extra])
    assert.equal(r.lineas.length, 2)
    assert.equal(r.descartadas.length, 0)
  })

  it('instanteDe permite al servidor usar la fecha de la fila guardada', () => {
    const a = linea({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', creadoEn: undefined })
    const b = linea({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', creadoEn: undefined })
    const fechas = new Map([[a.id, 1000], [b.id, 2000]])
    const r = deduplicarLineasCuadre([a, b], { instanteDe: l => fechas.get(l.id) ?? 0 })
    assert.equal(r.lineas[0].id, b.id)
  })

  it('tolera null y arrays vacíos', () => {
    assert.deepEqual(deduplicarLineasCuadre(null).lineas, [])
    assert.deepEqual(deduplicarLineasCuadre([]).descartadas, [])
  })
})

// --- sincronización -------------------------------------------------------

describe('sincronizarLineas', () => {
  it('una lectura fallida (null) no crea ni borra nada', async () => {
    const api = apiFalsa()
    const r = await sincronizarLineas({
      lineas: [linea()],
      existentes: null,
      cuadreId: CUADRE,
      api
    })
    assert.equal(r.ok, false)
    assert.equal(r.motivo, 'lectura')
    assert.equal(api.llamadas.crear.length, 0)
    assert.equal(api.llamadas.eliminar.length, 0)
  })

  it('no vacía un cuadre que ya tiene líneas', async () => {
    const api = apiFalsa()
    const r = await sincronizarLineas({
      lineas: [],
      existentes: [linea()],
      cuadreId: CUADRE,
      api
    })
    assert.equal(r.ok, false)
    assert.equal(r.motivo, 'vacio')
    assert.equal(api.llamadas.eliminar.length, 0)
  })

  it('adopta el id que devuelve el backend', async () => {
    const api = apiFalsa({ idDevuelto: '99999999-9999-4999-8999-999999999999' })
    const l = linea()
    const r = await sincronizarLineas({ lineas: [l], existentes: [], cuadreId: CUADRE, api })
    assert.equal(r.ok, true)
    assert.equal(r.creadas, 1)
    assert.equal(l.id, '99999999-9999-4999-8999-999999999999')
  })

  it('con el id adoptado, la segunda pasada actualiza en vez de crear', async () => {
    const api = apiFalsa({ idDevuelto: '99999999-9999-4999-8999-999999999999' })
    const l = linea()
    await sincronizarLineas({ lineas: [l], existentes: [], cuadreId: CUADRE, api })
    l.cantidad = 4
    l.subtotal = 40
    const r = await sincronizarLineas({
      lineas: [l],
      existentes: [{ ...l, cantidad: 1, subtotal: 10 }],
      cuadreId: CUADRE,
      api
    })
    assert.equal(r.creadas, 0)
    assert.equal(r.actualizadas, 1)
    assert.equal(api.llamadas.crear.length, 1)
  })

  it('sin cambios no reescribe la fila', async () => {
    const api = apiFalsa()
    const l = linea()
    const r = await sincronizarLineas({ lineas: [l], existentes: [l], cuadreId: CUADRE, api })
    assert.equal(r.ok, true)
    assert.equal(r.actualizadas, 0)
    assert.equal(api.llamadas.actualizar.length, 0)
  })

  it('borra las líneas guardadas que ya no están en memoria', async () => {
    const api = apiFalsa()
    const viva = linea()
    const sobra = linea({ id: '55555555-5555-4555-8555-555555555555', secuencia: 9 })
    const r = await sincronizarLineas({
      lineas: [viva],
      existentes: [viva, sobra],
      cuadreId: CUADRE,
      api
    })
    assert.equal(r.eliminadas, 1)
    assert.deepEqual(api.llamadas.eliminar, [sobra.id])
  })

  it('si falla una escritura no borra nada', async () => {
    const api = apiFalsa({ crearFalla: true })
    const r = await sincronizarLineas({
      lineas: [linea()],
      existentes: [linea({ id: '55555555-5555-4555-8555-555555555555', secuencia: 9 })],
      cuadreId: CUADRE,
      api
    })
    assert.equal(r.ok, false)
    assert.equal(r.motivo, 'escritura')
    assert.equal(api.llamadas.eliminar.length, 0)
  })

  it('si falla un borrado lo reporta y no sigue', async () => {
    const api = apiFalsa({ eliminarFalla: true })
    const r = await sincronizarLineas({
      lineas: [],
      existentes: [linea()],
      cuadreId: CUADRE,
      api,
      permitirBorradoTotal: true
    })
    assert.equal(r.ok, false)
    assert.equal(r.motivo, 'escritura')
  })

  it('permitirBorradoTotal sí vacía el cuadre', async () => {
    const api = apiFalsa()
    const r = await sincronizarLineas({
      lineas: [],
      existentes: [linea()],
      cuadreId: CUADRE,
      api,
      permitirBorradoTotal: true
    })
    assert.equal(r.ok, true)
    assert.equal(r.eliminadas, 1)
  })

  it('ignora filas de otro cuadre', async () => {
    const api = apiFalsa()
    const otro = linea({ id: '55555555-5555-4555-8555-555555555555', cuadreId: 'otro-cuadre' })
    const r = await sincronizarLineas({
      lineas: [],
      existentes: [otro],
      cuadreId: CUADRE,
      api,
      permitirBorradoTotal: true
    })
    assert.equal(r.ok, true)
    assert.equal(r.eliminadas, 0)
  })
})

describe('lineaCambio / payloadLinea', () => {
  it('detecta el cambio de cantidad', () => {
    assert.equal(lineaCambio(linea({ cantidad: 1 }), linea({ cantidad: 2 })), true)
    assert.equal(lineaCambio(linea({ cantidad: 2 }), linea({ cantidad: 2 })), false)
  })

  it('el payload lleva el id y normaliza nulos', () => {
    const p = payloadLinea(linea({ nota: undefined, loteId: undefined, esExtra: undefined }), CUADRE)
    assert.equal(p.id, linea().id)
    assert.equal(p.cuadreId, CUADRE)
    assert.equal(p.nota, null)
    assert.equal(p.loteId, null)
    assert.equal(p.esExtra, false)
  })

  it('usa el cuadreId de la línea si lo trae', () => {
    const p = payloadLinea(linea({ cuadreId: 'otro' }), CUADRE)
    assert.equal(p.cuadreId, 'otro')
  })
})
