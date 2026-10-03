import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db, schema } from '../../../database/client'
import { requireRole, hashPin } from '../../../utils/auth'
import { exigirPuesto } from '../../../utils/puesto'

const zBody = z.object({ pin: z.string().min(4).max(6) })

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const id = event.context.params!.id as string
  const body = await readValidatedBody(event, zBody.parse)

  // Endpoint casi muerto (la UI usa PATCH /api/usuarios/:id), pero reachable:
  // no se cambia el PIN de un usuario ajeno.
  await exigirPuesto(auth, 'usuarios', id, 'Usuario')

  const pinHash = await hashPin(body.pin)
  const [row] = await db
    .update(schema.usuarios)
    .set({ pinHash, actualizadoEn: new Date() })
    .where(eq(schema.usuarios.id, id))
    .returning({ id: schema.usuarios.id, nombre: schema.usuarios.nombre })

  if (!row) throw createError({ statusCode: 404, statusMessage: 'Usuario no encontrado.' })
  return { success: true, ...row }
})
