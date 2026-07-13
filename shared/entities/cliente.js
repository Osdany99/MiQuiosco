import { createEntity } from './_factory.js'

/**
 * shared/entities/cliente.js — Entity del cliente.
 */
export const cliente = createEntity({
  key: 'cliente',
  tabla: 'clientes',
  label: 'Cliente',
  pluralLabel: 'Clientes',
  puestoScoped: true,
  sync: true,
  ui: true,

  fields: {
    nombre: { type: 'string', required: true, max: 200, label: 'Nombre', form: { placeholder: 'Nombre del cliente', colSpan: 'sm:col-span-2' } },
    telefono: { type: 'string', nullable: true, label: 'Teléfono', form: { placeholder: 'Teléfono opcional', colSpan: 'sm:col-span-2' } },
    notas: { type: 'text', nullable: true, label: 'Notas', form: { input: 'textarea', placeholder: 'Notas opcionales', colSpan: 'sm:col-span-2' } },
    activo: { type: 'boolean', required: true, default: true, label: 'Activo', form: { colSpan: 'sm:col-span-2' } }
  },

  columns: [
    { accessorKey: 'id', header: 'ID', visible: false },
    { accessorKey: 'nombre', header: 'Nombre' },
    { accessorKey: 'telefono', header: 'Teléfono' },
    { accessorKey: 'notas', header: 'Notas' },
    { accessorKey: 'activo', header: 'Estado', cell: 'activation' },
    { accessorKey: 'action', header: 'Acciones' }
  ]
})
