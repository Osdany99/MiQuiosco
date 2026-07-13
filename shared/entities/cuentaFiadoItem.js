import { createEntity } from './_factory.js'

/**
 * shared/entities/cuentaFiadoItem.js — Entity de las líneas de una cuenta de fiado.
 */
export const cuentaFiadoItem = createEntity({
  key: 'cuentaFiadoItem',
  tabla: 'cuentas_fiado_items',
  label: 'Línea de Fiado',
  pluralLabel: 'Líneas de Fiado',
  sync: true,
  ui: false,

  fields: {
    cuentaFiadoId: { type: 'uuid', required: true, label: 'Cuenta' },
    productoId: { type: 'uuid', required: true, label: 'Producto' },
    cantidad: { type: 'number', required: true, min: 0, label: 'Cantidad' },
    precioVentaUsado: { type: 'number', required: true, min: 0, label: 'Precio' },
    subtotal: { type: 'number', required: true, min: 0, label: 'Subtotal' }
  },

  columns: []
})
