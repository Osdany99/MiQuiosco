import { eq, and, gte, lte, desc, sql } from 'drizzle-orm'
import { db } from '../../database/client'
import { cuadres, usuarios } from '../../database/schema'
import { requireRole, requireAuth } from '../../utils/auth'

/**
 * GET /api/graficas/comparativa-por-trabajador?desde=&hasta=
 *
 * Comparativa de cuadres por trabajador de turno.
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
      trabajadorId: cuadres.trabajadorTurnoId,
      trabajadorNombre: usuarios.nombre,
      totalCuadres: sql<number>`count(*)`.as('total_cuadres'),
      diferenciaPromedio: sql<number>`avg(${cuadres.diferencia})`.as('diferencia_promedio'),
      cuadresConFaltante: sql<number>`
        sum(case when ${cuadres.diferencia} < 0 then 1 else 0 end)
      `.as('cuadres_con_faltante')
    })
    .from(cuadres)
    .innerJoin(usuarios, eq(usuarios.id, cuadres.trabajadorTurnoId))
    .where(and(...whereConditions))
    .groupBy(cuadres.trabajadorTurnoId, usuarios.nombre)
    .orderBy(sql`diferencia_promedio`)

  return rows.map(r => ({
    trabajadorId: r.trabajadorId,
    trabajadorNombre: r.trabajadorNombre,
    totalCuadres: Number(r.totalCuadres),
    diferenciaPromedio: Number(r.diferenciaPromedio),
    cuadresConFaltante: Number(r.cuadresConFaltante)
  }))
})
