import { clienteSchema } from '~~/shared/schemas/cliente'
import { crudPatch } from '../../utils/crud'

export default defineEventHandler(async (event) => {
  await requireRole(event, 'jefe')
  const body = await readBody(event)
  return await crudPatch({ tabla: 'clientes', label: 'Cliente', schema: clienteSchema }, { id: event.context.params!.id as string, body })
})
