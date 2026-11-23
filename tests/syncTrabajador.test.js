import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { filtrarPendientesTrabajador, TABLAS_PUSH_TRABAJADOR } from '../app/utils/syncTrabajador.js'

describe('sync trabajador: payload mínimo', () => {
  it('conserva solo las operaciones de voz y elimina deletes', () => {
    const cuentas = [{ id: 'deuda-1' }]
    const filtrado = filtrarPendientesTrabajador({
      clientes: [
        { id: 'sin-cliente', nombre: 'Sin cliente', esCentinela: true, activo: true },
        { id: 'cliente-ajeno', nombre: 'Cliente del jefe', esCentinela: false, activo: true }
      ],
      cuadres: [{ id: 'cuadre-1' }],
      cuentas_fiado: cuentas,
      cuentas_fiado_items: [{ id: 'linea-1' }],
      movimientos_inventario: [{ id: 'mov-1' }],
      transferencias: [{ id: 'trans-1' }],
      usuarios: [{ id: 'admin', rol: 'jefe' }],
      productos: [{ id: 'producto-cambiado' }],
      pagos_fiado: [{ id: 'cobro-prohibido' }],
      deletes: [{ tabla: 'usuarios', id: 'admin' }]
    })

    assert.deepEqual(filtrado.deletes, [])
    assert.equal(filtrado.usuarios, undefined)
    assert.equal(filtrado.productos, undefined)
    assert.equal(filtrado.pagos_fiado, undefined)
    assert.deepEqual(filtrado.clientes.map(c => c.id), ['sin-cliente'])
    assert.equal(filtrado.cuentas_fiado, cuentas)
    for (const tabla of TABLAS_PUSH_TRABAJADOR) assert.ok(Array.isArray(filtrado[tabla]))
  })

  it('un payload vacío no genera tablas innecesarias', () => {
    assert.deepEqual(filtrarPendientesTrabajador({ usuarios: [], deletes: [] }), { deletes: [] })
  })
})
