import { crudList } from '../../utils/crud'

export default defineEventHandler(async (event) => {
  await requireRole(event, 'jefe')
  const query = getQuery(event)
  const orderOpts = {
    orderBy: query.orderBy || 'creadoEn',
    orderDir: query.orderDir || 'desc'
  }
  return await crudList({ tabla: 'movimientos_inventario', puestoScoped: true }, { query: { ...query, ...orderOpts } })
})
