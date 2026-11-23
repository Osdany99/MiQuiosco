import { resolverClave } from '../permisos.js'

/**
 * Matriz de autorización de comandos de voz.
 *
 * `null` = el rol nunca puede ejecutar el comando; `[]` = no exige otra clave.
 * La ubicación de micrófono (`acciones.<ubicacion>.voz`) se comprueba al mostrar
 * el dock; aquí se valida la acción de negocio que se va a resolver/ejecutar.
 */
export function clavesComandoVoz(comando, {
  rol,
  ubicacion = 'almacen',
  tipoVenta = 'directa',
  accionCuadre = null
} = {}) {
  const ubi = ubicacion === 'quiosco' ? 'quiosco' : 'almacen'

  if (rol === 'trabajador') {
    if (comando === 'venta_fiada') return ['acciones.cuadre.fiar', `acciones.${ubi}.voz`]
    if (comando === 'deuda_dinero') return ['acciones.cuadre.fiar']
    if (comando === 'transferencia_cuadre') return ['acciones.cuadre.transferencia']
    if (comando === 'ayuda' || comando === 'repetir') return []
    return null
  }

  if (rol !== 'jefe') return null

  if (comando === 'venta_fiada' || comando === 'deuda_dinero' || comando === 'consulta_deuda') {
    return ['vistas.deudas']
  }
  if (comando === 'cobro_deuda') return ['acciones.deudas.cobrar']
  if (comando === 'transferencia_cuadre') return ['acciones.cuadre.transferencia']
  if (comando === 'venta_directa') {
    const modalidad = tipoVenta === 'directa' ? 'contado' : tipoVenta
    return [`acciones.${ubi}.vender`, `venta.${modalidad}`]
  }
  if (comando === 'consulta_stock' || comando === 'consulta_precio') return [`vistas.${ubi}`]
  if (comando === 'consulta_dia' || comando === 'consulta_caja') return ['vistas.cuadre']
  if (comando === 'consulta_ganancia') return ['datos.ver_ganancias']
  if (comando === 'entrada_inventario') return ['acciones.almacen.entrada']
  if (comando === 'cambio_precio') return ['acciones.productos.precio']
  if (comando === 'traspaso') return ['acciones.almacen.traspaso', 'acciones.quiosco.traspaso']
  if (comando === 'ajuste_inventario') return [`acciones.${ubi}.ajuste`]
  if (comando === 'producto_alta') return ['acciones.productos.crear']
  if (comando === 'cliente_alta') return ['acciones.clientes.crear']
  if (comando === 'mover_producto') return ['acciones.productos.reordenar']
  if (comando === 'cuadre_accion') {
    return [accionCuadre === 'cerrar' ? 'acciones.cuadre.cerrar' : 'vistas.cuadre']
  }
  if (comando === 'ayuda' || comando === 'repetir') return []
  return null
}

/** Devuelve también las claves ausentes para pruebas/diagnóstico sin PII. */
export function autorizarComandoVoz({
  comando,
  rol,
  permisos = {},
  ubicacion = 'almacen',
  tipoVenta = 'directa',
  accionCuadre = null
} = {}) {
  const claves = clavesComandoVoz(comando, { rol, ubicacion, tipoVenta, accionCuadre })
  if (claves === null) {
    return { ok: false, motivo: 'rol', claves: [], faltantes: [] }
  }
  const faltantes = claves.filter(clave => !resolverClave(clave, permisos))
  return {
    ok: faltantes.length === 0,
    motivo: faltantes.length ? 'permiso' : null,
    claves,
    faltantes
  }
}
