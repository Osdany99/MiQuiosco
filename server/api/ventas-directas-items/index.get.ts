import { and, eq, type Column } from 'drizzle-orm'
import { crudList } from '../../utils/crud'
import { requireRole } from '../../utils/auth'
import { condicionHijosDelPuesto } from '../../utils/puesto'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const query = getQuery(event)

  return await crudList({ tabla: 'ventas_directas_items' }, {
    query,
    auth,
    listFilter: async ({ query: q, columns }) => {
      const conds = []
      if (q.venta_directa_id) conds.push(eq(columns.ventaDirectaId as Column, String(q.venta_directa_id)))
      // Solo lineas de ventas propias (ver cuadre-items/index.get.ts).
      conds.push(await condicionHijosDelPuesto(auth, 'ventas_directas_items', columns.ventaDirectaId))
      return and(...conds)
    }
  })
})
