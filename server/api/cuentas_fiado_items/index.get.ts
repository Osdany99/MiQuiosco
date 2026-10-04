import { and, eq, type Column } from 'drizzle-orm'
import { crudList } from '../../utils/crud'
import { requireRole } from '../../utils/auth'
import { condicionHijosDelPuesto } from '../../utils/puesto'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const query = getQuery(event)

  return await crudList({ tabla: 'cuentas_fiado_items' }, {
    query,
    auth,
    listFilter: async ({ query: q, columns }) => {
      const conds = []
      if (q.cuenta_fiado_id) conds.push(eq(columns.cuentaFiadoId as Column, String(q.cuenta_fiado_id)))
      // Solo lineas de cuentas propias (ver cuadre-items/index.get.ts).
      conds.push(await condicionHijosDelPuesto(auth, 'cuentas_fiado_items', columns.cuentaFiadoId))
      return and(...conds)
    }
  })
})
