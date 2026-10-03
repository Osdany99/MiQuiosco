import { crudGet } from '../../utils/crud'
import { requireRole } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  return await crudGet({ tabla: 'usuarios', label: 'Usuario' }, {
    id: event.context.params!.id as string,
    auth,
    serialize: (row) => {
      const copy = { ...row }
      delete copy.pinHash
      return copy
    }
  })
})
