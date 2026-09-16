import { cuadreItemSchema } from '#shared/schemas/cuadreItem'
import { crudPatch } from '../../utils/crud'

export default defineEventHandler(async (event) => {
  await requireRole(event, 'jefe')
  const body = await readBody(event)
  return await crudPatch({ tabla: 'cuadre_items', label: 'Línea de Cuadre', schema: cuadreItemSchema }, { id: event.context.params!.id as string, body })
})
