import { crudList } from '../../utils/crud'
import { requireRole } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const query = getQuery(event)
  return await crudList({ tabla: 'traspasos', puestoScoped: true }, { query, auth })
})
