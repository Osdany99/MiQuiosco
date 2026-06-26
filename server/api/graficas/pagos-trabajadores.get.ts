import { eq, and, gte, lte, desc, sql } from 'drizzle-orm'
import { db } from '../../database/client'
import { cuadres, usuarios } from '../../database/schema'
import { requireRole, requireAuth } from '../../utils/auth'

/**
 * GET /api/graficas/pagos-trabajadores?desde=&hasta=
 *
 * Total pagado a cada trabajador por período.
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
    eq(cuadres.estado, 'cerrado'),
    sql`${cuadres.pagoTrabajador} IS NOT NULL`
  ]

  if (desde) whereConditions.push(gte(cuadres.fecha, desde))
  if (hasta) whereConditions.push(lte(cuadres.fecha, hasta))

  const rows = await db
    .select({
      trabajadorId: cuadres.trabajadorTurnoId,
      trabajadorNombre: usuarios.nombre,
      totalPagado: sql<number>`sum(${cuadres.pagoTrabajador})`.as('total_pagado')
    })
    .from(cuadres)
    .innerJoin(usuarios, eq(usuarios.id, cuadres.trabajadorTurnoId))
    .where(and(...whereConditions))
    .groupBy(cuadres.trabajadorTurnoId, usuarios.nombre)
    .orderBy(desc(sql`total_pagado`))

  return rows.map(r => ({
    trabajadorId: r.trabajadorId,
    trabajadorNombre: r.trabajadorNombre,
    totalPagado: Number(r.totalPagado)
  }))
})
