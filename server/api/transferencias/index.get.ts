import { eq, and, desc } from 'drizzle-orm'
import { db } from '../../database/client'
import { transferencias, usuarios } from '../../database/schema'
import { requireRole } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireRole(event, 'jefe')
  const query = getQuery(event)
  const conditions = []

  if (query.clienteId) {
    conditions.push(eq(transferencias.clienteId, String(query.clienteId)))
  }
  if (query.cuadre_id || query.cuadreId) {
    conditions.push(eq(transferencias.cuadreId, String(query.cuadre_id || query.cuadreId)))
  }

  const rows = await db
    .select({
      id: transferencias.id,
      clienteId: transferencias.clienteId,
      nombreCliente: usuarios.nombre,
      cuadreId: transferencias.cuadreId,
      montoTotal: transferencias.montoTotal,
      creadoEn: transferencias.creadoEn,
      actualizadoEn: transferencias.actualizadoEn
    })
    .from(transferencias)
    .innerJoin(usuarios, eq(transferencias.clienteId, usuarios.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(transferencias.creadoEn))

  return rows.map(r => ({
    id: r.id,
    clienteId: r.clienteId,
    nombreCliente: r.nombreCliente,
    cuadreId: r.cuadreId,
    montoTotal: r.montoTotal,
    creadoEn: r.creadoEn.toISOString(),
    actualizadoEn: r.actualizadoEn.toISOString()
  }))
})
