import { eq, type Column } from 'drizzle-orm'
import { crudList } from '../../utils/crud'
import { requireRole } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const query = getQuery(event)

  return await crudList({ tabla: 'cuadres', puestoScoped: true }, {
    query,
    auth,
    listFilter: ({ query: q, columns }) => {
      if (q.fecha) return eq(columns.fecha as Column, String(q.fecha))
      return undefined
    }
  })
})
