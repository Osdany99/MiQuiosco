import { eq } from 'drizzle-orm'
import {
  generateAuthenticationOptions
} from '@simplewebauthn/server'
import type { AuthenticatorTransport } from '@simplewebauthn/server'
import { db } from '../../../database/client'
import { webauthnCredentials } from '../../../database/schema'
import { webauthnLoginOptionsSchema } from '#shared/schemas/webauthn'
import {
  buscarUsuarioPorNombre,
  credencialesInvalidas,
  emitirChallenge,
  getRpInfo
} from '../../../utils/webauthn'

/**
 * POST /api/auth/webauthn/login-options
 * Devuelve las options para startAuthentication(). Si el usuario no existe,
 * está inactivo o no tiene credenciales: 401 genérico (anti-enumeración).
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const parsed = webauthnLoginOptionsSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Datos inválidos.', data: parsed.error.flatten() })
  }

  const usuario = await buscarUsuarioPorNombre(parsed.data.nombre_usuario)
  if (!usuario || !usuario.activo) credencialesInvalidas()

  const creds = await db
    .select({ credentialId: webauthnCredentials.credentialId, transports: webauthnCredentials.transports })
    .from(webauthnCredentials)
    .where(eq(webauthnCredentials.usuarioId, usuario.id))
  if (!creds.length) credencialesInvalidas()

  const { rpID } = getRpInfo(event)
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: creds.map(c => ({
      id: c.credentialId,
      transports: (c.transports ?? ['internal']) as AuthenticatorTransport[]
    })),
    userVerification: 'required'
  })

  await emitirChallenge(usuario.id, 'authentication', options.challenge)
  return options
})
