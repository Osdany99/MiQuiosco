import { eq, type Column } from 'drizzle-orm'
import { crudList } from '../../utils/crud'

export default defineEventHandler(async (event) => {
  await requireRole(event, 'jefe')
  const query = getQuery(event)

  return await crudList({ tabla: 'ventas_directas_items' }, {
    query,
    listFilter: ({ query: q, columns }) => {
      if (q.venta_directa_id) return eq(columns.ventaDirectaId as Column, String(q.venta_directa_id))
      return undefined
    }
  })
})
