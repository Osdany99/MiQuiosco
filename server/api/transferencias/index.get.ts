import { eq, and, desc } from 'drizzle-orm'
import { db } from '../../database/client'
import { transferencias, clientes } from '../../database/schema'
import { requireRole } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const query = getQuery(event)
  // Siempre el puesto propio: sin esto, cualquier filtro (clienteId, cuadreId)
  // devolvia filas de otros puestos.
  const conditions = [eq(transferencias.puestoId, auth.usuario.puestoId)]

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
      nombreCliente: clientes.nombre,
      cuadreId: transferencias.cuadreId,
      montoTotal: transferencias.montoTotal,
      creadoEn: transferencias.creadoEn,
      actualizadoEn: transferencias.actualizadoEn
    })
    .from(transferencias)
    // clienteId apunta a la tabla clientes desde la migracion 0018 (antes a
    // usuarios): el join contra usuarios hacia INVISIBLES las transferencias
    // nuevas en este listado.
    .innerJoin(clientes, eq(transferencias.clienteId, clientes.id))
    .where(and(...conditions))
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
