import { cuentaFiadoItemSchema } from '#shared/schemas/cuentaFiadoItem'
import { crudPatch } from '../../utils/crud'
import { requireRole } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const body = await readBody(event)
  return await crudPatch({ tabla: 'cuentas_fiado_items', label: 'Línea de Fiado', schema: cuentaFiadoItemSchema }, { id: event.context.params!.id as string, body, auth })
})
