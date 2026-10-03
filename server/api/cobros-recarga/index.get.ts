import { desc, type Column } from 'drizzle-orm'
import { db } from '../../database/client'
import { cobrosRecarga } from '../../database/schema'
import { requireRole } from '../../utils/auth'
import { condicionHijosDelPuesto } from '../../utils/puesto'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const query = getQuery(event)

  // Los cobros no llevan puestoId: se ven solo los de recargas propias. Si el
  // recargaId es ajeno, la composicion da lista vacia (sin oraculo).
  const condicion = await condicionHijosDelPuesto(
    auth,
    'cobros_recarga',
    cobrosRecarga.recargaId as Column,
    query.recargaId ? String(query.recargaId) : undefined
  )

  const rows = await db
    .select()
    .from(cobrosRecarga)
    .where(condicion)
    .orderBy(desc(cobrosRecarga.creadoEn))

  return rows.map(r => ({ ...r, creadoEn: r.creadoEn.toISOString() }))
})
