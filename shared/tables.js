/**
 * shared/tables.js — Fuente única de verdad para todas las tablas sincronizables.
 *
 * Tanto el server como el client importan de aquí.
 * Incluye: endpoints, puestoScoped, label, syncNumeric, insertOnly.
 */

const endpoint = segment => ({
  list: `/api/${segment}`,
  byId: id => `/api/${segment}/${id}`
})

export const productos = {
  tabla: 'productos',
  endpoints: endpoint('productos'),
  puestoScoped: true,
  label: { singular: 'Producto', plural: 'Productos', gender: 'm' },
  syncNumeric: ['precioCompraActual', 'precioVentaActual'],
  insertOnly: false
}

export const usuarios = {
  tabla: 'usuarios',
  endpoints: endpoint('usuarios'),
  puestoScoped: true,
  label: { singular: 'Usuario', plural: 'Usuarios', gender: 'm' },
  syncNumeric: ['salario'],
  insertOnly: false
}

export const cuadres = {
  tabla: 'cuadres',
  endpoints: endpoint('cuadres'),
  puestoScoped: true,
  label: { singular: 'Cuadre', plural: 'Cuadres', gender: 'm' },
  syncNumeric: ['pagoTrabajador', 'totalEsperado', 'totalRealCaja', 'montoTransferencia', 'montoFiado', 'montoCobradoFiado', 'diferencia'],
  insertOnly: false
}

export const cuadre_items = {
  tabla: 'cuadre_items',
  endpoints: endpoint('cuadre-items'),
  label: { singular: 'Línea', plural: 'Líneas', gender: 'f' },
  syncNumeric: ['precioVentaUsado', 'cantidad', 'subtotal'],
  insertOnly: false
}

export const cuentas_fiado = {
  tabla: 'cuentas_fiado',
  endpoints: endpoint('cuentas-fiado'),
  puestoScoped: true,
  label: { singular: 'Cuenta', plural: 'Cuentas', gender: 'f' },
  syncNumeric: ['montoTotal', 'montoPagado'],
  insertOnly: false
}

export const cuentas_fiado_items = {
  tabla: 'cuentas_fiado_items',
  endpoints: endpoint('cuentas_fiado_items'),
  label: { singular: 'Línea', plural: 'Líneas', gender: 'f' },
  syncNumeric: ['cantidad', 'precioVentaUsado', 'subtotal'],
  insertOnly: true
}

export const pagos_fiado = {
  tabla: 'pagos_fiado',
  endpoints: endpoint('pagos-fiado'),
  label: { singular: 'Pago', plural: 'Pagos', gender: 'm' },
  syncNumeric: ['monto'],
  insertOnly: true
}

export const historial_precios = {
  tabla: 'historial_precios',
  endpoints: endpoint('historial_precios'),
  label: { singular: 'Precio', plural: 'Precios', gender: 'm' },
  syncNumeric: ['precioCompra', 'precioVenta'],
  insertOnly: true
}

export const TABLES = {
  productos, usuarios, cuadres, cuadre_items,
  cuentas_fiado, cuentas_fiado_items, pagos_fiado, historial_precios
}

export const SYNC_TABLES = [
  productos, usuarios, cuadres, cuadre_items,
  cuentas_fiado, cuentas_fiado_items, pagos_fiado, historial_precios
]
