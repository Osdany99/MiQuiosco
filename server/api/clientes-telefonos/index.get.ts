import { eq, and, desc } from 'drizzle-orm'
import { db } from '../../database/client'
import { clientes, clientesTelefonos } from '../../database/schema'
import { requireRole } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const query = getQuery(event)
  // Siempre el puesto propio (la tabla lleva puestoId: ver shared/tables.js).
  const conditions = [eq(clientesTelefonos.puestoId, auth.usuario.puestoId)]

  if (query.clienteId) {
    conditions.push(eq(clientesTelefonos.clienteId, String(query.clienteId)))
  }
  if (query.telefono) {
    conditions.push(eq(clientesTelefonos.telefono, String(query.telefono)))
  }
  if (query.activo === '1') {
    conditions.push(eq(clientesTelefonos.activo, true))
  }

  const rows = await db
    .select({
      id: clientesTelefonos.id,
      puestoId: clientesTelefonos.puestoId,
      clienteId: clientesTelefonos.clienteId,
      nombreCliente: clientes.nombre,
      telefono: clientesTelefonos.telefono,
      telefonoRaw: clientesTelefonos.telefonoRaw,
      etiqueta: clientesTelefonos.etiqueta,
      activo: clientesTelefonos.activo,
      creadoEn: clientesTelefonos.creadoEn,
      actualizadoEn: clientesTelefonos.actualizadoEn
    })
    .from(clientesTelefonos)
    .innerJoin(clientes, eq(clientesTelefonos.clienteId, clientes.id))
    .where(and(...conditions))
    .orderBy(desc(clientesTelefonos.creadoEn))

  return rows.map(r => ({
    ...r,
    creadoEn: r.creadoEn.toISOString(),
    actualizadoEn: r.actualizadoEn.toISOString()
  }))
})
