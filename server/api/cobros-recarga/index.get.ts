import { eq, desc } from 'drizzle-orm'
import { db } from '../../database/client'
import { cobrosRecarga } from '../../database/schema'
import { requireRole } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireRole(event, 'jefe')
  const query = getQuery(event)
  const conditions = []

  if (query.recargaId) {
    conditions.push(eq(cobrosRecarga.recargaId, String(query.recargaId)))
  }

  const rows = await db
    .select()
    .from(cobrosRecarga)
    .where(conditions.length > 0 ? conditions[0] : undefined)
    .orderBy(desc(cobrosRecarga.creadoEn))

  return rows.map(r => ({ ...r, creadoEn: r.creadoEn.toISOString() }))
})
