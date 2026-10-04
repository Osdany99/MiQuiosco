import { cuadreSchema } from '#shared/schemas/cuadre'
import { crudPatch } from '../../utils/crud'
import { requireRole } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const body = await readBody(event)
  return await crudPatch({ tabla: 'cuadres', label: 'Cuadre', schema: cuadreSchema }, { id: event.context.params!.id as string, body, auth })
})
