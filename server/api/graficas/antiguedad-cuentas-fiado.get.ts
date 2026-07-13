import { sql } from 'drizzle-orm'
import { db } from '../../database/client'
import { cuentasFiado } from '../../database/schema'
import { requireRole } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireRole(event, 'jefe')

  const getRango = (min: number, max: number | null) => {
    if (max === null) return sql`${cuentasFiado.creadoEn} < now() - interval '${sql.raw(String(min))} days'`
    return sql`${cuentasFiado.creadoEn} >= now() - interval '${sql.raw(String(max))} days' AND ${cuentasFiado.creadoEn} < now() - interval '${sql.raw(String(min))} days'`
  }

  const rangos = [
    { label: '0-30 días', min: 0, max: 30 },
    { label: '31-60 días', min: 30, max: 60 },
    { label: '61-90 días', min: 60, max: 90 },
    { label: 'Más de 90 días', min: 90, max: null }
  ]

  const result = await Promise.all(rangos.map(async (r) => {
    const rows = await db
      .select({
        total: sql<number>`count(*)`,
        montoTotal: sql<number>`coalesce(sum(${cuentasFiado.montoTotal}), 0)`,
        saldoPendiente: sql<number>`coalesce(sum(${cuentasFiado.montoTotal} - ${cuentasFiado.montoPagado}), 0)`
      })
      .from(cuentasFiado)
      .where(sql`${cuentasFiado.estado} != 'pagada' AND ${getRango(r.min, r.max)}`)
    return {
      rango: r.label,
      totalCuentas: Number(rows[0]!.total),
      montoTotal: Number(rows[0]!.montoTotal),
      saldoPendiente: Number(rows[0]!.saldoPendiente)
    }
  }))

  return result
})
