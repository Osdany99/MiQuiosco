import { clienteSchema } from '~~/shared/schemas/cliente'
import { crudCreate } from '../../utils/crud'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const body = await readBody(event)
  return await crudCreate({ tabla: 'clientes', schema: clienteSchema, puestoScoped: true }, { body, auth })
})
