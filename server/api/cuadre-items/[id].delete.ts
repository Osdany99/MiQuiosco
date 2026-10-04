import { crudRemove } from '../../utils/crud'
import { requireRole } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  return await crudRemove({ tabla: 'cuadre_items', label: 'Línea de Cuadre', id: event.context.params!.id as string, auth })
})
