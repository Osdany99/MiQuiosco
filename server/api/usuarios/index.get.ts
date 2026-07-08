import { desc, eq } from 'drizzle-orm'
import { db } from '../../database/client'
import { usuarios } from '../../database/schema'
import { requireRole } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')

  const rows = await db
    .select({
      id: usuarios.id,
      nombre: usuarios.nombre,
      rol: usuarios.rol,
      activo: usuarios.activo,
      salario: usuarios.salario,
      debeCambiarPin: usuarios.debeCambiarPin,
      creadoEn: usuarios.creadoEn,
      actualizadoEn: usuarios.actualizadoEn
    })
    .from(usuarios)
    .where(eq(usuarios.puestoId, auth.usuario.puestoId))
    .orderBy(desc(usuarios.creadoEn))

  return rows.map(r => ({
    ...r,
    salario: Number(r.salario),
    creadoEn: r.creadoEn.toISOString(),
    actualizadoEn: r.actualizadoEn.toISOString()
  }))
})
