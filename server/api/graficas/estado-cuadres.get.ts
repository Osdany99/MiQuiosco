import { eq, and, gte, lte, sql } from 'drizzle-orm'
import { db } from '../../database/client'
import { cuadres } from '../../database/schema'
import { requireRole, requireAuth } from '../../utils/auth'

/**
 * GET /api/graficas/estado-cuadres?desde=&hasta=
 *
 * Cuadres exactos / faltante / sobrante.
 */
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin')
  const auth = await requireAuth(event)
  if (auth.usuario.rol !== 'admin' && auth.usuario.rol !== 'jefe') {
    throw createError({ statusCode: 403, statusMessage: 'Acceso denegado.' })
  }

  const query = getQuery(event)
  const desde = query.desde as string
  const hasta = query.hasta as string

  const whereConditions = [
    eq(cuadres.estado, 'cerrado')
  ]

  if (desde) whereConditions.push(gte(cuadres.fecha, desde))
  if (hasta) whereConditions.push(lte(cuadres.fecha, hasta))

  const rows = await db
    .select({
      exactos: sql<number>`
        sum(case when ${cuadres.diferencia} = 0 then 1 else 0 end)
      `.as('exactos'),
      sobrantes: sql<number>`
        sum(case when ${cuadres.diferencia} > 0 then 1 else 0 end)
      `.as('sobrantes'),
      faltantes: sql<number>`
        sum(case when ${cuadres.diferencia} < 0 then 1 else 0 end)
      `.as('faltantes')
    })
    .from(cuadres)
    .where(and(...whereConditions))

  const r = rows[0]
  return [
    { estado: 'Exacto', cantidad: Number(r?.exactos ?? 0) },
    { estado: 'Sobrante', cantidad: Number(r?.sobrantes ?? 0) },
    { estado: 'Faltante', cantidad: Number(r?.faltantes ?? 0) }
  ]
})
