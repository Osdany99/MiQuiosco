import { proveedorSchema } from '#shared/schemas/proveedor'
import { crudCreate } from '../../utils/crud'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const body = await readBody(event)
  return await crudCreate({ tabla: 'proveedores', schema: proveedorSchema, puestoScoped: true }, { body, auth })
})
