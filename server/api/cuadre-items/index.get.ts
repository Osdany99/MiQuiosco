import { and, eq, type Column } from 'drizzle-orm'
import { crudList } from '../../utils/crud'
import { requireRole } from '../../utils/auth'
import { condicionHijosDelPuesto } from '../../utils/puesto'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const query = getQuery(event)

  return await crudList({ tabla: 'cuadre_items' }, {
    query,
    auth,
    listFilter: async ({ query: q, columns }) => {
      const conds = []
      if (q.cuadre_id) conds.push(eq(columns.cuadreId as Column, String(q.cuadre_id)))
      // Solo lineas de cuadres propios (si el cuadre_id es ajeno, la
      // composicion da lista vacia sin oraculo).
      conds.push(await condicionHijosDelPuesto(auth, 'cuadre_items', columns.cuadreId))
      return and(...conds)
    }
  })
})
