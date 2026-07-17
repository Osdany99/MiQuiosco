export interface SyncTable {
  tabla: string
  syncNumeric: string[]
  insertOnly: boolean
}

export const SYNC_TABLES: SyncTable[] = [
  { tabla: 'productos', syncNumeric: ['precioCompraActual', 'precioVentaActual'], insertOnly: false },
  { tabla: 'usuarios', syncNumeric: ['salario'], insertOnly: false },
  { tabla: 'cuadres', syncNumeric: ['pagoTrabajador', 'totalEsperado', 'totalRealCaja', 'montoTransferencia', 'montoFiado', 'montoCobradoFiado', 'diferencia'], insertOnly: false },
  { tabla: 'cuadre_items', syncNumeric: ['precioVentaUsado', 'cantidad', 'subtotal'], insertOnly: false },
  { tabla: 'cuentas_fiado', syncNumeric: ['montoTotal', 'montoPagado'], insertOnly: false },
  { tabla: 'cuentas_fiado_items', syncNumeric: ['cantidad', 'precioVentaUsado', 'subtotal'], insertOnly: true },
  { tabla: 'pagos_fiado', syncNumeric: ['monto'], insertOnly: true },
  { tabla: 'historial_precios', syncNumeric: ['precioCompra', 'precioVenta'], insertOnly: true }
]
