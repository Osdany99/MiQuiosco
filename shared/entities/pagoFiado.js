import { createEntity } from './_factory.js'

/**
 * shared/entities/pagoFiado.js — Entity de pago de fiado.
 */
export const pagoFiado = createEntity({
  key: 'pagoFiado',
  tabla: 'pagos_fiado',
  label: 'Pago de Fiado',
  pluralLabel: 'Pagos de Fiado',
  sync: true,
  ui: false,

  fields: {
    cuentaFiadoId: { type: 'uuid', required: true, label: 'Cuenta' },
    cuadreId: { type: 'uuid', required: true, label: 'Cuadre' },
    monto: { type: 'number', required: true, min: 0, label: 'Monto' },
    formaPago: { type: 'enum', values: ['efectivo', 'transferencia'], required: true, label: 'Forma de Pago' }
  },

  columns: []
})
