import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db, schema } from '../../../database/client'
import { requireRole, hashPin } from '../../../utils/auth'

const zBody = z.object({ pin: z.string().min(4).max(6) })

export default defineEventHandler(async (event) => {
  await requireRole(event, 'jefe')
  const id = event.context.params!.id as string
  const body = await readValidatedBody(event, zBody.parse)

  const pinHash = await hashPin(body.pin)
  const [row] = await db
    .update(schema.usuarios)
    .set({ pinHash, actualizadoEn: new Date() })
    .where(eq(schema.usuarios.id, id))
    .returning({ id: schema.usuarios.id, nombre: schema.usuarios.nombre })

  if (!row) throw createError({ statusCode: 404, statusMessage: 'Usuario no encontrado.' })
  return { success: true, ...row }
})
