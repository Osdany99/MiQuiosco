import { desc, eq } from 'drizzle-orm'
import { requireSuperAdmin } from '../../../utils/auth'
import { db } from '../../../database/client'
import { vozConfirmaciones, puestos } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const query = getQuery(event)
  const limit = Math.min(Math.max(Number(query.limit) || 200, 1), 1000)
  const puestoId = typeof query.puestoId === 'string' ? query.puestoId : undefined

  const base = db
    .select({
      id: vozConfirmaciones.id,
      puestoId: vozConfirmaciones.puestoId,
      puestoNombre: puestos.nombre,
      dispositivoId: vozConfirmaciones.dispositivoId,
      productoId: vozConfirmaciones.productoId,
      productoNombre: vozConfirmaciones.productoNombre,
      cantidad: vozConfirmaciones.cantidad,
      ubicacion: vozConfirmaciones.ubicacion,
      modo: vozConfirmaciones.modo,
      confianza: vozConfirmaciones.confianza,
      outcome: vozConfirmaciones.outcome,
      creadoEn: vozConfirmaciones.creadoEn
    })
    .from(vozConfirmaciones)
    .leftJoin(puestos, eq(puestos.id, vozConfirmaciones.puestoId))

  const q = puestoId ? base.where(eq(vozConfirmaciones.puestoId, puestoId)) : base
  return q.orderBy(desc(vozConfirmaciones.creadoEn)).limit(limit)
})
