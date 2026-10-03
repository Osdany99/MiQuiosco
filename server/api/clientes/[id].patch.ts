import { requireRole } from '../../utils/auth'
import { crudPatch } from '../../utils/crud'
import { clienteSchema } from '#shared/schemas/cliente'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const body = await readBody(event)
  const id = String(event.context.params?.id ?? '')
  return await crudPatch({ tabla: 'clientes', label: 'Cliente', schema: clienteSchema }, { id, body, auth })
})
