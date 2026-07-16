import { cuentaFiadoItemSchema } from '~~/shared/schemas/cuentaFiadoItem'
import { crudCreate } from '../../utils/crud'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const body = await readBody(event)
  return await crudCreate({ tabla: 'cuentas_fiado_items', schema: cuentaFiadoItemSchema }, { body, auth })
})
