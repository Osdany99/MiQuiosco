import { createEntity } from './_factory.js'

/**
 * shared/entities/cuadreItem.js — Entity de las líneas de cuadre.
 */
export const cuadreItem = createEntity({
  key: 'cuadreItem',
  tabla: 'cuadre_items',
  label: 'Línea de Cuadre',
  pluralLabel: 'Líneas de Cuadre',
  sync: true,
  ui: false,

  fields: {
    cuadreId: { type: 'uuid', required: true, label: 'Cuadre' },
    productoId: { type: 'uuid', required: true, label: 'Producto' },
    precioVentaUsado: { type: 'number', required: true, min: 0, default: 0, label: 'Precio' },
    cantidad: { type: 'number', required: true, min: 0, default: 0, label: 'Cantidad' },
    subtotal: { type: 'number', required: true, min: 0, default: 0, label: 'Subtotal' },
    tipoLinea: { type: 'enum', values: ['normal', 'descuento'], required: true, default: 'normal', label: 'Tipo' },
    nota: { type: 'text', nullable: true, label: 'Nota' },
    esExtra: { type: 'boolean', required: true, default: false, label: 'Extra' }
  },

  columns: []
})
