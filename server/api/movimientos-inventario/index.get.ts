import { crudList } from '../../utils/crud'
import { requireRole } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const query = getQuery(event)
  const orderOpts = {
    orderBy: query.orderBy || 'creadoEn',
    orderDir: query.orderDir || 'desc'
  }
  return await crudList({ tabla: 'movimientos_inventario', puestoScoped: true }, { query: { ...query, ...orderOpts }, auth })
})
