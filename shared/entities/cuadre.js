import { createEntity } from './_factory.js'

/**
 * shared/entities/cuadre.js — Entity del cuadre diario.
 */
export const cuadre = createEntity({
  key: 'cuadre',
  tabla: 'cuadres',
  label: 'Cuadre',
  pluralLabel: 'Cuadres',
  puestoScoped: true,
  sync: true,
  ui: true,

  fields: {
    puestoId: { type: 'uuid', required: true, label: 'Puesto' },
    fecha: { type: 'date', required: true, label: 'Fecha' },
    jefeId: { type: 'uuid', required: true, label: 'Jefe' },
    trabajadorTurnoId: { type: 'uuid', nullable: true, label: 'Trabajador' },
    pagoTrabajador: { type: 'number', min: 0, nullable: true, label: 'Pago Trabajador' },
    totalEsperado: { type: 'number', required: true, min: 0, default: 0, label: 'Total Esperado' },
    totalRealCaja: { type: 'number', min: 0, nullable: true, label: 'Total Real Caja' },
    montoTransferencia: { type: 'number', required: true, min: 0, default: 0, label: 'Transferencia' },
    montoFiado: { type: 'number', required: true, min: 0, default: 0, label: 'Fiado' },
    montoCobradoFiado: { type: 'number', required: true, min: 0, default: 0, label: 'Fiado Cobrado' },
    diferencia: { type: 'number', nullable: true, label: 'Diferencia' },
    estado: { type: 'enum', values: ['abierto', 'cerrado'], required: true, default: 'abierto', label: 'Estado' },
    notas: { type: 'text', nullable: true, label: 'Notas' },
    cerradoEn: { type: 'date', nullable: true, label: 'Cerrado en' },
    reabiertoVeces: { type: 'int', min: 0, default: 0, label: 'Reabierto veces' },
    ultimaReaperturaEn: { type: 'date', nullable: true, label: 'Última reapertura' }
  },

  columns: [
    { accessorKey: 'id', header: 'ID', visible: false },
    { accessorKey: 'fecha', header: 'Fecha' },
    { accessorKey: 'jefeId', header: 'Jefe' },
    { accessorKey: 'estado', header: 'Estado' },
    { accessorKey: 'totalEsperado', header: 'Esperado' },
    { accessorKey: 'totalRealCaja', header: 'Real' },
    { accessorKey: 'diferencia', header: 'Diferencia' },
    { accessorKey: 'action', header: 'Acciones' }
  ]
})
