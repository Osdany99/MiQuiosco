import { eq, and, ne } from 'drizzle-orm'
import { crudRemove } from '../../utils/crud'
import { requireRole } from '../../utils/auth'
import { db } from '../../database/client'
import { usuarios } from '../../database/schema'

export default defineEventHandler(async (event) => {
  await requireRole(event, 'jefe')
  const id = event.context.params!.id as string

  // Guard: no borrar al último jefe activo
  const [target] = await db.select({ rol: usuarios.rol }).from(usuarios).where(eq(usuarios.id, id)).limit(1)
  if (target?.rol === 'jefe') {
    const otrosJefes = await db.select({ id: usuarios.id }).from(usuarios).where(and(eq(usuarios.rol, 'jefe'), eq(usuarios.activo, true), ne(usuarios.id, id))).limit(1)
    if (otrosJefes.length === 0) {
      throw createError({ statusCode: 400, statusMessage: 'No puedes eliminar al último jefe activo.' })
    }
  }

  return await crudRemove({ tabla: 'usuarios', label: 'Usuario', id })
})
