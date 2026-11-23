import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { separarOperacionesStock } from '../app/utils/syncLotes.js'

describe('sync: operaciones de stock indivisibles', () => {
  it('agrupa venta + items + FIFO y deja otras filas para sus lotes normales', () => {
    const { grupos, restante } = separarOperacionesStock({
      ventas_directas: [{ id: 'venta-1' }, { id: 'venta-2' }],
      ventas_directas_items: [
        { id: 'item-1', ventaDirectaId: 'venta-1' },
        { id: 'item-2', ventaDirectaId: 'venta-1' }
      ],
      movimientos_inventario: [
        { id: 'mov-1', ventaDirectaId: 'venta-1', ventaDirectaItemId: 'item-1' },
        { id: 'mov-2', ventaDirectaId: 'venta-1', ventaDirectaItemId: 'item-2' },
        { id: 'mov-3', tipo: 'merma' }
      ],
      productos: [{ id: 'prod-1' }]
    })

    assert.equal(grupos.length, 1)
    assert.equal(grupos[0].anchor, 'ventas_directas')
    assert.equal(grupos[0].total, 5)
    assert.deepEqual(grupos[0].payload.ventas_directas.map(r => r.id), ['venta-1'])
    assert.deepEqual(grupos[0].payload.ventas_directas_items.map(r => r.id), ['item-1', 'item-2'])
    assert.deepEqual(grupos[0].payload.movimientos_inventario.map(r => r.id), ['mov-1', 'mov-2'])
    assert.deepEqual(restante.ventas_directas.map(r => r.id), ['venta-2'])
    assert.deepEqual(restante.movimientos_inventario.map(r => r.id), ['mov-3'])
    assert.deepEqual(restante.productos.map(r => r.id), ['prod-1'])
  })

  it('también conserva juntos traspaso, cuadre y deuda directa', () => {
    const { grupos, restante } = separarOperacionesStock({
      traspasos: [{ id: 'tras-1' }],
      cuadres: [{ id: 'cuadre-1' }],
      cuadre_items: [{ id: 'linea-1', cuadreId: 'cuadre-1' }],
      cuentas_fiado: [{ id: 'deuda-1' }],
      cuentas_fiado_items: [{ id: 'fiado-item-1', cuentaFiadoId: 'deuda-1' }],
      movimientos_inventario: [
        { id: 'mov-t', traspasoId: 'tras-1' },
        { id: 'mov-c', cuadreId: 'cuadre-1', lineaCuadreId: 'linea-1' },
        { id: 'mov-f', cuentaFiadoItemId: 'fiado-item-1' }
      ]
    })

    assert.deepEqual(grupos.map(g => g.anchor), ['traspasos', 'cuadre_items', 'cuentas_fiado'])
    assert.equal(grupos[0].total, 2)
    assert.equal(grupos[1].total, 3)
    assert.equal(grupos[2].total, 3)
    assert.deepEqual(restante.movimientos_inventario, [])
  })

  it('un movimiento independiente no fabrica una operación incompleta', () => {
    const { grupos, restante } = separarOperacionesStock({
      movimientos_inventario: [{ id: 'merma-1', tipo: 'merma' }]
    })
    assert.deepEqual(grupos, [])
    assert.deepEqual(restante.movimientos_inventario.map(r => r.id), ['merma-1'])
  })
})
