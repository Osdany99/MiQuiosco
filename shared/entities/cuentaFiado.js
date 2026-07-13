import { createEntity } from './_factory.js'

/**
 * shared/entities/cuentaFiado.js — Entity de cuenta de fiado.
 */
export const cuentaFiado = createEntity({
  key: 'cuentaFiado',
  tabla: 'cuentas_fiado',
  label: 'Cuenta de Fiado',
  pluralLabel: 'Cuentas de Fiado',
  puestoScoped: true,
  sync: true,
  ui: true,

  fields: {
    puestoId: { type: 'uuid', required: true, label: 'Puesto' },
    clienteId: { type: 'uuid', required: true, label: 'Cliente' },
    cuadreOrigenId: { type: 'uuid', required: true, label: 'Cuadre Origen' },
    montoTotal: { type: 'number', required: true, min: 0, default: 0, label: 'Monto Total' },
    montoPagado: { type: 'number', required: true, min: 0, default: 0, label: 'Monto Pagado' },
    estado: { type: 'enum', values: ['pendiente', 'parcial', 'pagada'], required: true, default: 'pendiente', label: 'Estado' }
  },

  columns: [
    { accessorKey: 'id', header: 'ID', visible: false },
    { accessorKey: 'clienteId', header: 'Cliente' },
    { accessorKey: 'montoTotal', header: 'Total' },
    { accessorKey: 'montoPagado', header: 'Pagado' },
    { accessorKey: 'estado', header: 'Estado' },
    { accessorKey: 'action', header: 'Acciones' }
  ]
})
