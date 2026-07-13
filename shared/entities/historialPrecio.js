import { createEntity } from './_factory.js'

/**
 * shared/entities/historialPrecio.js — Entity del historial de precios.
 *
 * Entity interna (ui: false): no tiene página, no se crea manualmente.
 * Las entradas las genera automáticamente producto.js vía customMutations.
 *
 * Solo expone endpoints para consulta (GET) y para que el sync la suba/baje.
 */
export const historialPrecio = createEntity({
  key: 'historialPrecio',
  tabla: 'historial_precios',
  label: 'Historial de Precio',
  pluralLabel: 'Historial de Precios',
  sync: true,
  ui: false,

  fields: {
    productoId: { type: 'uuid', required: true, label: 'Producto' },
    precioCompra: { type: 'number', required: true, min: 0, label: 'Precio Compra' },
    precioVenta: { type: 'number', required: true, min: 0, label: 'Precio Venta' },
    vigenteDesde: { type: 'date', required: true, label: 'Vigente desde' },
    vigenteHasta: { type: 'date', nullable: true, label: 'Vigente hasta' },
    cambiadoPor: { type: 'uuid', nullable: true, label: 'Cambiado por' }
  },

  columns: []
})
