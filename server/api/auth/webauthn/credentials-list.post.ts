import { eq } from 'drizzle-orm'
import { db } from '../../../database/client'
import { webauthnCredentials } from '../../../database/schema'
import { webauthnCredentialsListSchema } from '#shared/schemas/webauthn'
import { exigirPinValido } from '../../../utils/webauthn'

/**
 * POST /api/auth/webauthn/credentials-list
 * Lista los dispositivos con huella del usuario. Exige PIN en cada
 * operación sensible (el trabajador no tiene JWT de sesión).
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const parsed = webauthnCredentialsListSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Datos inválidos.', data: parsed.error.flatten() })
  }

  const usuario = await exigirPinValido(parsed.data.nombre_usuario, parsed.data.pin)
  const creds = await db
    .select({
      credentialId: webauthnCredentials.credentialId,
      nombreDispositivo: webauthnCredentials.nombreDispositivo,
      creadoEn: webauthnCredentials.creadoEn
    })
    .from(webauthnCredentials)
    .where(eq(webauthnCredentials.usuarioId, usuario.id))

  return { credentials: creds }
})
