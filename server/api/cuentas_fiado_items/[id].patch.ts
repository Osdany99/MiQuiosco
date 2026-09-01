import { cuentaFiadoItemSchema } from '../../../shared/schemas/cuentaFiadoItem'
import { crudPatch } from '../../utils/crud'

export default defineEventHandler(async (event) => {
  await requireRole(event, 'jefe')
  const body = await readBody(event)
  return await crudPatch({ tabla: 'cuentas_fiado_items', label: 'Línea de Fiado', schema: cuentaFiadoItemSchema }, { id: event.context.params!.id as string, body })
})
