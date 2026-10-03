import { crudGet } from '../../utils/crud'
import { requireRole } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  return await crudGet({ tabla: 'productos', label: 'Producto' }, { id: event.context.params!.id as string, auth })
})
