import { createEntity } from './_factory.js'

/**
 * shared/entities/usuario.js — Entity del usuario.
 *
 * El PIN no se persiste en la entity principal (se guarda hasheado en pinHash);
 * se incluye en el schema para validación del form de creación, pero en el server
 * se transforma a pinHash antes de guardar.
 */
export const usuario = createEntity({
  key: 'usuario',
  tabla: 'usuarios',
  label: 'Usuario',
  pluralLabel: 'Usuarios',
  puestoScoped: true,
  sync: true,
  ui: true,

  fields: {
    nombre: { type: 'string', required: true, max: 100, label: 'Nombre', form: { placeholder: 'Nombre completo' } },
    rol: {
      type: 'enum', values: ['jefe', 'trabajador'], required: true, default: 'trabajador', label: 'Rol',
      form: { items: [{ label: 'Jefe', value: 'jefe' }, { label: 'Trabajador', value: 'trabajador' }] }
    },
    salario: {
      type: 'number', min: 0, default: 600, label: 'Salario base',
      form: { placeholder: '600', props: { min: 0 }, hidden: form => form?.rol !== 'trabajador' }
    },
    pin: {
      type: 'string', min: 4, max: 6, label: 'PIN',
      form: { input: 'password', required: true, maxlength: 6, props: { mask: true }, hidden: form => !!form?.id }
    },
    activo: { type: 'boolean', required: true, default: true, label: 'Activo' }
  },

  columns: [
    { accessorKey: 'id', header: 'ID', visible: false },
    { accessorKey: 'nombre', header: 'Nombre' },
    { accessorKey: 'rol', header: 'Rol' },
    { accessorKey: 'salario', header: 'Salario' },
    { accessorKey: 'activo', header: 'Estado', cell: 'activation' },
    { accessorKey: 'action', header: 'Acciones' }
  ],

  customActions: {
    resetPin: { path: id => `${id}/pin` }
  }
})
