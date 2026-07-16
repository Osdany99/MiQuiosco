import { crudGet } from '../../utils/crud'

export default defineEventHandler(async (event) => {
  await requireRole(event, 'jefe')
  return await crudGet({ tabla: 'usuarios', label: 'Usuario' }, {
    id: event.context.params!.id as string,
    serialize: (row) => {
      const copy = { ...row }
      delete copy.pinHash
      return copy
    }
  })
})
