import { cuadreItemSchema } from '~~/shared/schemas/cuadreItem'
import { crudCreate } from '../../utils/crud'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const body = await readBody(event)
  return await crudCreate({ tabla: 'cuadre_items', schema: cuadreItemSchema }, { body, auth })
})
