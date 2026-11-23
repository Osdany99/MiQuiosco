import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { autorizarComandoVoz, clavesComandoVoz } from '../shared/voz/permisos.js'

const COMANDOS_JEFE = [
  'venta_directa', 'venta_fiada', 'cobro_deuda', 'deuda_dinero', 'transferencia_cuadre',
  'consulta_stock', 'consulta_precio', 'consulta_deuda', 'consulta_dia', 'consulta_ganancia',
  'consulta_caja', 'entrada_inventario', 'cambio_precio', 'traspaso', 'ajuste_inventario',
  'producto_alta', 'cliente_alta', 'mover_producto', 'cuadre_accion', 'ayuda', 'repetir'
]

describe('voz: matriz rol × acción × ubicación', () => {
  it('el jefe conserva todos los comandos con permisos por defecto', () => {
    for (const comando of COMANDOS_JEFE) {
      const r = autorizarComandoVoz({ comando, rol: 'jefe', permisos: {} })
      assert.equal(r.ok, true, `${comando} debería permitirse por defecto`)
    }
  })

  it('cada acción desactivada bloquea su comando, sin apagar los demás', () => {
    const casos = [
      ['venta_directa', 'acciones.almacen.vender', {}],
      ['venta_directa', 'venta.regalo', { tipoVenta: 'regalo' }],
      ['venta_fiada', 'vistas.deudas', {}],
      ['cobro_deuda', 'acciones.deudas.cobrar', {}],
      ['deuda_dinero', 'vistas.deudas', {}],
      ['transferencia_cuadre', 'acciones.cuadre.transferencia', {}],
      ['consulta_stock', 'vistas.quiosco', { ubicacion: 'quiosco' }],
      ['consulta_precio', 'vistas.almacen', { ubicacion: 'almacen' }],
      ['consulta_ganancia', 'datos.ver_ganancias', {}],
      ['entrada_inventario', 'acciones.almacen.entrada', {}],
      ['cambio_precio', 'acciones.productos.precio', {}],
      ['traspaso', 'acciones.quiosco.traspaso', {}],
      ['ajuste_inventario', 'acciones.quiosco.ajuste', { ubicacion: 'quiosco' }],
      ['producto_alta', 'acciones.productos.crear', {}],
      ['cliente_alta', 'acciones.clientes.crear', {}],
      ['mover_producto', 'acciones.productos.reordenar', {}],
      ['cuadre_accion', 'acciones.cuadre.cerrar', { accionCuadre: 'cerrar' }]
    ]
    for (const [comando, clave, opciones] of casos) {
      const r = autorizarComandoVoz({
        comando,
        rol: 'jefe',
        permisos: { [clave]: false },
        ...opciones
      })
      assert.equal(r.ok, false, `${comando} debería bloquearse con ${clave}=false`)
      assert.deepEqual(r.faltantes, [clave])
      assert.equal(autorizarComandoVoz({ comando: 'ayuda', rol: 'jefe', permisos: { [clave]: false } }).ok, true)
    }
  })

  it('trabajador solo puede fiar, deuda de dinero y transferencia en el cuadre', () => {
    for (const comando of ['venta_fiada', 'deuda_dinero']) {
      assert.equal(autorizarComandoVoz({ comando, rol: 'trabajador', permisos: {} }).ok, true)
      assert.equal(autorizarComandoVoz({
        comando,
        rol: 'trabajador',
        permisos: { 'acciones.cuadre.fiar': false }
      }).ok, false)
    }
    assert.equal(autorizarComandoVoz({ comando: 'transferencia_cuadre', rol: 'trabajador', permisos: {} }).ok, true)
    assert.equal(autorizarComandoVoz({
      comando: 'transferencia_cuadre',
      rol: 'trabajador',
      permisos: { 'acciones.cuadre.transferencia': false }
    }).ok, false)
  })

  it('trabajador no hereda cobros, ventas, consultas ni administración aunque las claves estén activas', () => {
    const prohibidos = COMANDOS_JEFE.filter(comando => ![
      'venta_fiada', 'deuda_dinero', 'transferencia_cuadre', 'ayuda', 'repetir'
    ].includes(comando))
    for (const comando of prohibidos) {
      const r = autorizarComandoVoz({ comando, rol: 'trabajador', permisos: {} })
      assert.equal(r.ok, false, `${comando} no pertenece al trabajador`)
      assert.equal(r.motivo, 'rol')
    }
  })

  it('una vista desactivada también apaga la acción del trabajador', () => {
    const r = autorizarComandoVoz({
      comando: 'venta_fiada',
      rol: 'trabajador',
      permisos: { 'vistas.cuadre': false }
    })
    assert.equal(r.ok, false)
    assert.deepEqual(r.faltantes, ['acciones.cuadre.fiar'])
  })

  it('el fiado con inventario exige la ubicación también offline', () => {
    const r = autorizarComandoVoz({
      comando: 'venta_fiada',
      rol: 'trabajador',
      ubicacion: 'quiosco',
      permisos: { 'acciones.quiosco.voz': false }
    })
    assert.equal(r.ok, false)
    assert.deepEqual(r.faltantes, ['acciones.quiosco.voz'])
    assert.equal(autorizarComandoVoz({
      comando: 'deuda_dinero',
      rol: 'trabajador',
      permisos: { 'acciones.quiosco.voz': false }
    }).ok, true)
  })

  it('ubicación y modalidad cambian las claves exigidas', () => {
    assert.deepEqual(
      clavesComandoVoz('venta_directa', { rol: 'jefe', ubicacion: 'quiosco', tipoVenta: 'familiar' }),
      ['acciones.quiosco.vender', 'venta.familiar']
    )
    assert.deepEqual(clavesComandoVoz('cuadre_accion', { rol: 'jefe', accionCuadre: 'abrir' }), ['vistas.cuadre'])
    assert.equal(clavesComandoVoz('venta_directa', { rol: 'super_admin' }), null)
  })
})
