import { crudRemove } from '../../utils/crud'

export default defineEventHandler(async (event) => {
  await requireRole(event, 'jefe')
  return await crudRemove({ tabla: 'cuadre_items', label: 'Línea de Cuadre', id: event.context.params!.id as string })
})
