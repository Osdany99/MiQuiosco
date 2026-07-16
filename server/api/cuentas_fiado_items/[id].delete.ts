import { crudRemove } from '../../utils/crud'

export default defineEventHandler(async (event) => {
  await requireRole(event, 'jefe')
  return await crudRemove({ tabla: 'cuentas_fiado_items', label: 'Línea de Fiado', id: event.context.params!.id as string })
})
