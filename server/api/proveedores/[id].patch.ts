import { proveedorSchema } from '#shared/schemas/proveedor'
import { crudPatch } from '../../utils/crud'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const body = await readBody(event)
  return await crudPatch({ tabla: 'proveedores', label: 'Proveedor', schema: proveedorSchema }, { id: event.context.params!.id as string, body, auth })
})
