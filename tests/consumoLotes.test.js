import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  calcularConsumoLotes,
  ordenarPorRango,
  ranksFifo
} from '../app/utils/inventario/consumoLotes.js'

describe('consumoLotes', () => {
  it('consumir en un solo lote si alcanza', () => {
    const lotes = [{ id: 'a', saldo: 5 }]
    const r = calcularConsumoLotes(lotes, 3)
    assert.equal(r.consumido, 3)
    assert.equal(r.faltante, 0)
    assert.deepEqual(r.lineas, [{ loteId: 'a', cantidad: 3 }])
  })

  it('cruce entre dos lotes cuando el primero no alcanza', () => {
    const lotes = [{ id: 'a', saldo: 4 }, { id: 'b', saldo: 5 }]
    const r = calcularConsumoLotes(lotes, 5)
    assert.equal(r.consumido, 5)
    assert.equal(r.faltante, 0)
    assert.deepEqual(r.lineas, [
      { loteId: 'a', cantidad: 4 },
      { loteId: 'b', cantidad: 1 }
    ])
  })

  it('reporta faltante si no hay stock suficiente', () => {
    const lotes = [{ id: 'a', saldo: 2 }, { id: 'b', saldo: 1 }]
    const r = calcularConsumoLotes(lotes, 5)
    assert.equal(r.consumido, 3)
    assert.equal(r.faltante, 2)
    assert.equal(r.lineas.reduce((a, b) => a + b.cantidad, 0), 3)
  })

  it('ignora lotes con saldo cero', () => {
    const lotes = [{ id: 'a', saldo: 0 }, { id: 'b', saldo: 4 }]
    const r = calcularConsumoLotes(lotes, 3)
    assert.deepEqual(r.lineas, [{ loteId: 'b', cantidad: 3 }])
  })

  it('cantidad 0 devuelve sin lineas', () => {
    const r = calcularConsumoLotes([{ id: 'a', saldo: 4 }], 0)
    assert.equal(r.lineas.length, 0)
    assert.equal(r.consumido, 0)
    assert.equal(r.faltante, 0)
  })

  it('rank manual prioriza menor rank', () => {
    const sel = [
      { id: 'a', rank: 2, fechaEntrada: '2026-01-01' },
      { id: 'b', rank: 1, fechaEntrada: '2026-02-01' }
    ]
    const ordered = ordenarPorRango(sel)
    assert.deepEqual(ordered.map(x => x.id), ['b', 'a'])
  })

  it('ranksFifo asigna 1 al más antiguo', () => {
    const lotes = [
      { id: 'x', fechaEntrada: '2026-03-01', saldo: 2 },
      { id: 'y', fechaEntrada: '2026-01-01', saldo: 4 }
    ]
    const out = ranksFifo(lotes)
    const y = out.find(l => l.id === 'y')
    assert.equal(y.rank, 1)
  })
})
