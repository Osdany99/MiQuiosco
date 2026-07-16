import { eq, type Column } from 'drizzle-orm'
import { crudList } from '../../utils/crud'

export default defineEventHandler(async (event) => {
  await requireRole(event, 'jefe')
  const query = getQuery(event)

  return await crudList({ tabla: 'cuadres', puestoScoped: true }, {
    query,
    listFilter: ({ query: q, columns }) => {
      if (q.fecha) return eq(columns.fecha as Column, String(q.fecha))
      return undefined
    }
  })
})
