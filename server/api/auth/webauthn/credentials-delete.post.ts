import { and, eq } from 'drizzle-orm'
import { db } from '../../../database/client'
import { webauthnCredentials } from '../../../database/schema'
import { webauthnCredentialsDeleteSchema } from '#shared/schemas/webauthn'
import { exigirPinValido } from '../../../utils/webauthn'

/**
 * POST /api/auth/webauthn/credentials-delete
 * Revoca la huella de un dispositivo (solo si pertenece al usuario).
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const parsed = webauthnCredentialsDeleteSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Datos inválidos.', data: parsed.error.flatten() })
  }

  const usuario = await exigirPinValido(parsed.data.nombre_usuario, parsed.data.pin)
  await db.delete(webauthnCredentials).where(and(
    eq(webauthnCredentials.usuarioId, usuario.id),
    eq(webauthnCredentials.credentialId, parsed.data.credential_id)
  ))

  return { ok: true }
})
