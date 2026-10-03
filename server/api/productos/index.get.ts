import { crudList } from '../../utils/crud'
import { requireRole } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const query = getQuery(event)
  const orderOpts = {
    orderBy: query.orderBy || 'orden',
    orderDir: query.orderDir || 'asc'
  }
  return await crudList({ tabla: 'productos', puestoScoped: true }, { query: { ...query, ...orderOpts }, auth })
})
