import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { usuarioSchema } from '../shared/schemas/usuario.js'
import { cuadreItemSchema } from '../shared/schemas/cuadreItem.js'
import { mergeFields } from '../app/utils/syncMerge.js'
import { fmtPrecio, calcularSalario, normalizarNumero, calcularSubtotalLinea } from '../app/utils/index.js'
import { sumarPorProducto, calcularExcesoTope } from '../shared/fiadoTope.js'

// --- usuarioSchema ---
describe('usuarioSchema', () => {
  it('acepta usuario válido sin pinHash', () => {
    const r = usuarioSchema.safeParse({ nombre: 'Ana', rol: 'trabajador', pin: '1234', activo: true })
    assert.equal(r.success, true)
    assert.equal(r.data.pinHash, undefined)
  })
  it('rechaza pinHash inyectado (mass assignment)', () => {
    const r = usuarioSchema.safeParse({ nombre: 'Ana', rol: 'jefe', pinHash: 'hash-malicioso', activo: true })
    // pinHash no está en el schema cliente → se stripea por Zod (no aparece en data)
    assert.equal(r.success, true)
    assert.equal(r.data.pinHash, undefined)
  })
  it('rechaza PIN corto', () => {
    const r = usuarioSchema.safeParse({ nombre: 'Ana', pin: '12' })
    assert.equal(r.success, false)
  })
})

// --- cuadreItemSchema ---
describe('cuadreItemSchema tipoLinea', () => {
  const uuidA = '550e8400-e29b-41d4-a716-446655440001'
  const uuidB = '550e8400-e29b-41d4-a716-446655440002'
  for (const tipo of ['normal', 'descuento', 'regalo', 'deuda', 'descuento_familiar']) {
    it(`acepta tipoLinea=${tipo}`, () => {
      const r = cuadreItemSchema.safeParse({ cuadreId: uuidA, productoId: uuidB, tipoLinea: tipo })
      assert.equal(r.success, true)
    })
  }
  it('rechaza tipoLinea inválido', () => {
    const r = cuadreItemSchema.safeParse({ cuadreId: uuidA, productoId: uuidB, tipoLinea: 'invalido' })
    assert.equal(r.success, false)
  })
})

// --- mergeFields (sync conflictos) ---
describe('mergeFields', () => {
  it('server null + client valor → difiereDelServidor true y aporta dato', () => {
    const server = { id: '1', telefono: null, actualizadoEn: '2026-01-01T00:00:00.000Z' }
    const client = { id: '1', telefono: '555', actualizadoEn: '2026-01-01T00:00:00.000Z' }
    const { merged, difiereDelServidor } = mergeFields(server, client)
    assert.equal(merged.telefono, '555')
    assert.equal(difiereDelServidor, true)
  })
  it('valores iguales → no difiere', () => {
    const server = { id: '1', nombre: 'A', actualizadoEn: '2026-01-01T00:00:00.000Z' }
    const client = { id: '1', nombre: 'A', actualizadoEn: '2026-01-01T00:00:00.000Z' }
    const { merged, difiereDelServidor } = mergeFields(server, client)
    assert.equal(merged.nombre, 'A')
    assert.equal(difiereDelServidor, false)
  })
  it('conflicto real (ambos no-null, difieren) → gana servidor (serverTs >= clientTs)', () => {
    const server = { id: '1', nombre: 'Server', actualizadoEn: '2026-01-02T00:00:00.000Z' }
    const client = { id: '1', nombre: 'Client', actualizadoEn: '2026-01-01T00:00:00.000Z' }
    const { merged } = mergeFields(server, client)
    assert.equal(merged.nombre, 'Server')
  })
})

// --- utils ---
describe('fmtPrecio y calcularSalario', () => {
  it('fmtPrecio formatea CUP', () => {
    const s = fmtPrecio(1234)
    assert.match(s, /1.*234/)
  })
  it('calcularSalario: sin bono bajo 20000', () => {
    assert.equal(calcularSalario(600, 15000), 600)
  })
  it('calcularSalario: 25000 → 1 tramo extra (tramo=2 → bono 100)', () => {
    assert.equal(calcularSalario(600, 25000), 700)
  })
})

// --- normalizarNumero y calcularSubtotalLinea (blindaje NaN del cuadre) ---
describe('normalizarNumero', () => {
  it('cadena vacia normaliza a 0 (borrar el campo no genera NaN)', () => {
    assert.equal(normalizarNumero(''), 0)
  })
  it('null/undefined/NaN → 0', () => {
    assert.equal(normalizarNumero(null), 0)
    assert.equal(normalizarNumero(undefined), 0)
    assert.equal(normalizarNumero(NaN), 0)
  })
  it('números y strings numéricos pasan intactos', () => {
    assert.equal(normalizarNumero(10), 10)
    assert.equal(normalizarNumero('10'), 10)
    assert.equal(normalizarNumero(0), 0)
  })
})

describe('calcularSubtotalLinea', () => {
  it('caso normal: 100 x 3 = 300', () => {
    assert.equal(calcularSubtotalLinea(100, 3), 300)
  })
  it('cantidad NaN → subtotal 0 (no contamina el total)', () => {
    assert.equal(calcularSubtotalLinea(100, NaN), 0)
  })
  it('precio vacio normaliza a subtotal 0', () => {
    assert.equal(calcularSubtotalLinea('', 3), 0)
  })
  it('redondea a centavos', () => {
    assert.equal(calcularSubtotalLinea(10.333, 3), 31)
  })
})

// --- tope de fiado (compartido cliente/servidor) ---
describe('sumarPorProducto', () => {
  it('suma cantidades por productoId', () => {
    const map = sumarPorProducto([
      { productoId: 'p1', cantidad: 2 },
      { productoId: 'p2', cantidad: 1 },
      { productoId: 'p1', cantidad: 3 }
    ])
    assert.equal(map.get('p1'), 5)
    assert.equal(map.get('p2'), 1)
  })
  it('ignora cantidades no numéricas', () => {
    const map = sumarPorProducto([
      { productoId: 'p1', cantidad: null },
      { productoId: 'p1', cantidad: undefined },
      { productoId: 'p1', cantidad: NaN }
    ])
    assert.equal(map.get('p1'), 0)
  })
})

describe('calcularExcesoTope', () => {
  const vendidos = new Map([['p1', 4], ['p2', 10]])

  it('null cuando fiado no supera lo vendido', () => {
    const fiados = new Map([['p1', 2]])
    const exceso = calcularExcesoTope(vendidos, fiados, [{ productoId: 'p1', cantidad: 2 }])
    assert.equal(exceso, null)
  })

  it('detecta exceso y devuelve disponible correcto', () => {
    const fiados = new Map([['p1', 3]])
    const exceso = calcularExcesoTope(vendidos, fiados, [{ productoId: 'p1', cantidad: 2 }])
    assert.ok(exceso)
    assert.equal(exceso.productoId, 'p1')
    assert.equal(exceso.disponible, 1)
  })

  it('sin fiados previos, el limite es lo vendido', () => {
    const fiados = new Map()
    const exceso = calcularExcesoTope(vendidos, fiados, [{ productoId: 'p1', cantidad: 5 }])
    assert.ok(exceso)
    assert.equal(exceso.disponible, 4)
  })

  it('producto sin ventas no admite fiado', () => {
    const fiados = new Map()
    const exceso = calcularExcesoTope(vendidos, fiados, [{ productoId: 'p3', cantidad: 1 }])
    assert.ok(exceso)
    assert.equal(exceso.disponible, 0)
  })

  it('lineas sin productoId no cuentan', () => {
    const fiados = new Map()
    const exceso = calcularExcesoTope(vendidos, fiados, [
      { productoId: '', cantidad: 1 },
      { productoId: null, cantidad: 1 }
    ])
    assert.equal(exceso, null)
  })

  it('cantidad 0 en linea nueva no genera exceso', () => {
    const fiados = new Map([['p1', 4]])
    const exceso = calcularExcesoTope(vendidos, fiados, [{ productoId: 'p1', cantidad: 0 }])
    assert.equal(exceso, null)
  })
})
