import { productoSchema } from '../../../shared/schemas/producto'
import { updateProductoMut } from '../../../shared/mutations/producto'
import { crudPatch } from '../../utils/crud'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const body = await readBody(event)
  return await crudPatch({ tabla: 'productos', label: 'Producto', schema: productoSchema, customMutations: { update: updateProductoMut } }, { id: event.context.params!.id as string, body, auth })
})
