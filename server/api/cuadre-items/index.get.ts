import { eq, type Column } from 'drizzle-orm'
import { crudList } from '../../utils/crud'

export default defineEventHandler(async (event) => {
  await requireRole(event, 'jefe')
  const query = getQuery(event)

  return await crudList({ tabla: 'cuadre_items' }, {
    query,
    listFilter: ({ query: q, columns }) => {
      if (q.cuadre_id) return eq(columns.cuadreId as Column, String(q.cuadre_id))
      return undefined
    }
  })
})
