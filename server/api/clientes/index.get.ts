import { requireRole } from '../../utils/auth'
import { crudList } from '../../utils/crud'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const query = getQuery(event)
  return await crudList({ tabla: 'clientes', puestoScoped: true }, { query, auth })
})
