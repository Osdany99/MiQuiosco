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
  syncNumeric: ['precioCompraActual', 'precioVentaActual', 'stockMinimoQuiosco', 'stockRecomendadoQuiosco', 'stockMinimoAlmacen'],
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
  syncNumeric: ['pagoTrabajador', 'totalEsperado', 'totalRealCaja', 'montoTransferencia', 'montoFiado', 'montoCobradoFiado', 'montoRegalo', 'montoDescuento', 'diferencia', 'costoTotal', 'ganancia'],
  insertOnly: false
}

export const cuadre_items = {
  tabla: 'cuadre_items',
  endpoints: endpoint('cuadre-items'),
  label: { singular: 'Línea', plural: 'Líneas', gender: 'f' },
  syncNumeric: ['precioVentaUsado', 'cantidad', 'subtotal', 'secuencia'],
  insertOnly: false
}

export const cuentas_fiado = {
  tabla: 'cuentas_fiado',
  endpoints: endpoint('cuentas-fiado'),
  puestoScoped: true,
  label: { singular: 'Cuenta', plural: 'Cuentas', gender: 'f' },
  // costoTotal/ganancia solo se llenan en deudas directas (en las de cuadre
  // son null y el costo vive congelado en cuadres).
  syncNumeric: ['montoTotal', 'montoPagado', 'costoTotal', 'ganancia'],
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

export const transferencias = {
  tabla: 'transferencias',
  endpoints: endpoint('transferencias'),
  puestoScoped: true,
  label: { singular: 'Transferencia', plural: 'Transferencias', gender: 'f' },
  syncNumeric: ['montoTotal'],
  insertOnly: false
}

export const transferencia_items = {
  tabla: 'transferencia_items',
  endpoints: endpoint('transferencia_items'),
  label: { singular: 'Línea', plural: 'Líneas', gender: 'f' },
  syncNumeric: ['cantidad', 'precioVentaUsado', 'subtotal'],
  insertOnly: true
}

export const ajustes = {
  tabla: 'ajustes',
  endpoints: endpoint('ajustes'),
  puestoScoped: true,
  label: { singular: 'Ajuste', plural: 'Ajustes', gender: 'm' },
  syncNumeric: ['cantidad', 'monto'],
  insertOnly: false
}

export const historial_precios = {
  tabla: 'historial_precios',
  endpoints: endpoint('historial_precios'),
  label: { singular: 'Precio', plural: 'Precios', gender: 'm' },
  syncNumeric: ['precioCompra', 'precioVenta'],
  insertOnly: true
}

export const proveedores = {
  tabla: 'proveedores',
  endpoints: endpoint('proveedores'),
  puestoScoped: true,
  label: { singular: 'Proveedor', plural: 'Proveedores', gender: 'm' },
  syncNumeric: [],
  insertOnly: false
}

export const lotes = {
  tabla: 'lotes',
  endpoints: endpoint('lotes'),
  puestoScoped: true,
  label: { singular: 'Lote', plural: 'Lotes', gender: 'm' },
  syncNumeric: ['cantidadInicial', 'precioUnitario'],
  insertOnly: true
}

export const traspasos = {
  tabla: 'traspasos',
  endpoints: endpoint('traspasos'),
  puestoScoped: true,
  label: { singular: 'Traspaso', plural: 'Traspasos', gender: 'm' },
  syncNumeric: [],
  insertOnly: false
}

export const movimientos_inventario = {
  tabla: 'movimientos_inventario',
  endpoints: endpoint('movimientos-inventario'),
  puestoScoped: true,
  label: { singular: 'Movimiento', plural: 'Movimientos', gender: 'm' },
  syncNumeric: ['cantidad', 'deltaAlmacen', 'deltaQuiosco', 'precioUnitario', 'importe'],
  // No es insertOnly aunque la regla de negocio sea append-only: el flag
  // `anulado` (reaperturas) debe propagarse como update por timestamp.
  insertOnly: false
}

export const ventas_directas = {
  tabla: 'ventas_directas',
  endpoints: endpoint('ventas-directas'),
  puestoScoped: true,
  label: { singular: 'Venta directa', plural: 'Ventas directas', gender: 'f' },
  syncNumeric: ['montoTotal', 'costoTotal', 'ganancia'],
  insertOnly: false
}

export const ventas_directas_items = {
  tabla: 'ventas_directas_items',
  endpoints: endpoint('ventas-directas-items'),
  label: { singular: 'Línea', plural: 'Líneas', gender: 'f' },
  syncNumeric: ['cantidad', 'precioVentaUsado', 'subtotal', 'costoUnitario', 'costoTotal', 'secuencia'],
  insertOnly: true
}

export const recargas = {
  tabla: 'recargas',
  endpoints: endpoint('recargas'),
  puestoScoped: true,
  label: { singular: 'Recarga', plural: 'Recargas', gender: 'f' },
  syncNumeric: ['montoNominal', 'costo', 'ganancia', 'montoCobrado'],
  insertOnly: false
}

export const clientes = {
  tabla: 'clientes',
  endpoints: endpoint('clientes'),
  puestoScoped: true,
  label: { singular: 'Cliente', plural: 'Clientes', gender: 'm' },
  syncNumeric: [],
  insertOnly: false
}

export const clientes_telefonos = {
  tabla: 'clientes_telefonos',
  endpoints: endpoint('clientes-telefonos'),
  puestoScoped: true,
  label: { singular: 'Teléfono', plural: 'Teléfonos', gender: 'm' },
  syncNumeric: [],
  insertOnly: false
}

export const cobros_recarga = {
  tabla: 'cobros_recarga',
  endpoints: endpoint('cobros-recarga'),
  label: { singular: 'Cobro', plural: 'Cobros', gender: 'm' },
  syncNumeric: ['monto'],
  insertOnly: true
}

// sms_etecsa NO entra en SYNC_TABLES: es un log local de diagnóstico del
// teléfono. Sincronizar 1 por 1 cada SMS crudo no aporta nada al negocio.

export const TABLES = {
  productos, usuarios, cuadres, cuadre_items,
  cuentas_fiado, cuentas_fiado_items, pagos_fiado, historial_precios,
  transferencias, transferencia_items, ajustes,
  proveedores, lotes, traspasos, movimientos_inventario,
  ventas_directas, ventas_directas_items,
  recargas, clientes, clientes_telefonos, cobros_recarga
}

export const SYNC_TABLES = [
  productos, usuarios, cuadres, cuadre_items,
  cuentas_fiado, cuentas_fiado_items, pagos_fiado, historial_precios,
  transferencias, transferencia_items, ajustes,
  proveedores, lotes, traspasos, movimientos_inventario,
  ventas_directas, ventas_directas_items,
  recargas, clientes, clientes_telefonos, cobros_recarga
]
