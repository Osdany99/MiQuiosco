import { eq, type Column } from 'drizzle-orm'
import { crudList } from '../../utils/crud'

export default defineEventHandler(async (event) => {
  await requireRole(event, 'jefe')
  const query = getQuery(event)

  return await crudList({ tabla: 'cuentas_fiado_items' }, {
    query,
    listFilter: ({ query: q, columns }) => {
      if (q.cuenta_fiado_id) return eq(columns.cuentaFiadoId as Column, String(q.cuenta_fiado_id))
      return undefined
    }
  })
})
