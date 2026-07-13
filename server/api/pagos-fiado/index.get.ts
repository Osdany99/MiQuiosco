import { eq } from 'drizzle-orm'
import { db } from '../../database/client'
import { pagosFiado, cuadres } from '../../database/schema'
import { requireRole } from '../../utils/auth'
import type { PagoFiado } from '#shared/types'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const query = getQuery(event)

  const rows = await db
    .select({
      id: pagosFiado.id,
      cuentaFiadoId: pagosFiado.cuentaFiadoId,
      cuadreId: pagosFiado.cuadreId,
      monto: pagosFiado.monto,
      formaPago: pagosFiado.formaPago,
      creadoEn: pagosFiado.creadoEn
    })
    .from(pagosFiado)
    .innerJoin(cuadres, eq(pagosFiado.cuadreId, cuadres.id))
    .where(
      query.cuadre_id
        ? eq(pagosFiado.cuadreId, String(query.cuadre_id))
        : eq(cuadres.puestoId, auth.usuario.puestoId)
    )

  return rows.map(r => ({
    id: r.id,
    cuentaFiadoId: r.cuentaFiadoId,
    cuadreId: r.cuadreId,
    monto: Number(r.monto),
    formaPago: r.formaPago,
    creadoEn: r.creadoEn.toISOString()
  } satisfies PagoFiado))
})
