import { crudRemove } from '../../utils/crud'
import { requireRole } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  return await crudRemove({ tabla: 'cuentas_fiado_items', label: 'Línea de Fiado', id: event.context.params!.id as string, auth })
})
