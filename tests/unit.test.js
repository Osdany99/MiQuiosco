import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { usuarioSchema } from '../shared/schemas/usuario.js'
import { cuadreItemSchema } from '../shared/schemas/cuadreItem.js'
import { mergeFields } from '../app/utils/syncMerge.js'
import { fmtPrecio, calcularSalario } from '../app/utils/index.js'

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
