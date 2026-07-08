import { eq, asc } from 'drizzle-orm'
import { db } from '../../database/client'
import { clientes } from '../../database/schema'
import { requireRole } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const query = getQuery(event)
  const rows = await db
    .select()
    .from(clientes)
    .where(eq(clientes.puestoId, auth.usuario.puestoId))
    .orderBy(asc(clientes.nombre))
  let result = rows.map(c => ({
    id: c.id,
    puestoId: c.puestoId,
    nombre: c.nombre,
    telefono: c.telefono,
    notas: c.notas,
    activo: c.activo,
    creadoEn: c.creadoEn.toISOString(),
    actualizadoEn: c.actualizadoEn.toISOString()
  }))
  if (query.nombre) {
    const q = String(query.nombre).toLowerCase()
    result = result.filter(c => c.nombre.toLowerCase().includes(q))
  }
  return result
})
