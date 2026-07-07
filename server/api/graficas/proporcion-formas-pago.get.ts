import { eq, and, gte, lte, sql } from 'drizzle-orm'
import { db } from '../../database/client'
import { cuadres } from '../../database/schema'
import { requireRole } from '../../utils/auth'

/**
 * GET /api/graficas/proporcion-formas-pago?desde=&hasta=
 *
 * Proporción efectivo / transferencia / fiado.
 */
export default defineEventHandler(async (event) => {
  await requireRole(event, 'jefe')

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
      totalEfectivo: sql<number>`sum(${cuadres.totalRealCaja})`.as('total_efectivo'),
      totalTransferencia: sql<number>`sum(${cuadres.montoTransferencia})`.as('total_transferencia'),
      totalFiado: sql<number>`sum(${cuadres.montoFiado})`.as('total_fiado')
    })
    .from(cuadres)
    .where(and(...whereConditions))

  const r = rows[0]
  return [
    { forma: 'Efectivo', total: Number(r?.totalEfectivo ?? 0) },
    { forma: 'Transferencia', total: Number(r?.totalTransferencia ?? 0) },
    { forma: 'Fiado', total: Number(r?.totalFiado ?? 0) }
  ]
})
