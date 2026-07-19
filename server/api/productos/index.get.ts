import { crudList } from '../../utils/crud'

export default defineEventHandler(async (event) => {
  await requireRole(event, 'jefe')
  const query = getQuery(event)
  const orderOpts = {
    orderBy: query.orderBy || 'orden',
    orderDir: query.orderDir || 'asc'
  }
  return await crudList({ tabla: 'productos', puestoScoped: true }, { query: { ...query, ...orderOpts } })
})
