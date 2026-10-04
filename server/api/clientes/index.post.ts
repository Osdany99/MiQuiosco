import { requireRole } from '../../utils/auth'
import { crudCreate } from '../../utils/crud'
import { clienteSchema } from '#shared/schemas/cliente'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const body = await readBody(event)
  return await crudCreate({ tabla: 'clientes', schema: clienteSchema, puestoScoped: true }, { body, auth })
})
