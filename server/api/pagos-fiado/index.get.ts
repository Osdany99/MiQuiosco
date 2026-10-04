import { and, eq } from 'drizzle-orm'
import { db } from '../../database/client'
import { pagosFiado, cuadres, cuentasFiado } from '../../database/schema'
import { requireRole } from '../../utils/auth'
import type { PagoFiado } from '#shared/types'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const query = getQuery(event)

  // El puesto propio aplica SIEMPRE: antes solo filtraba en la rama por
  // defecto, y con ?cuenta_fiado_id= de otro puesto se leian sus pagos.
  const conditions = [eq(cuentasFiado.puestoId, auth.usuario.puestoId)]
  if (query.cuadre_id) {
    conditions.push(eq(pagosFiado.cuadreId, String(query.cuadre_id)))
  } else if (query.cuenta_fiado_id) {
    conditions.push(eq(pagosFiado.cuentaFiadoId, String(query.cuenta_fiado_id)))
  }

  // leftJoin, no innerJoin: los cobros directos no tienen cuadre receptor
  // (cuadreId NULL) y hay que verlos igual.
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
    .leftJoin(cuadres, eq(pagosFiado.cuadreId, cuadres.id))
    .innerJoin(cuentasFiado, eq(pagosFiado.cuentaFiadoId, cuentasFiado.id))
    .where(and(...conditions))

  return rows.map(r => ({
    id: r.id,
    cuentaFiadoId: r.cuentaFiadoId,
    cuadreId: r.cuadreId,
    directo: r.cuadreId === null,
    monto: r.monto,
    formaPago: r.formaPago,
    creadoEn: r.creadoEn.toISOString()
  } satisfies PagoFiado))
})
