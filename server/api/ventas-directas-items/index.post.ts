import { ventaDirectaItemSchema } from '#shared/schemas/ventaDirectaItem'
import { crudCreate } from '../../utils/crud'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const body = await readBody(event)
  return await crudCreate({ tabla: 'ventas_directas_items', schema: ventaDirectaItemSchema }, { body, auth })
})
