import { productoSchema } from '~~/shared/schemas/producto'
import { createProductoMut } from '~~/shared/mutations/producto'
import { crudCreate } from '../../utils/crud'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const body = await readBody(event)
  return await crudCreate({ tabla: 'productos', schema: productoSchema, puestoScoped: true, customMutations: { create: createProductoMut } }, { body, auth })
})
