import { eq } from 'drizzle-orm'
import {
  generateRegistrationOptions
} from '@simplewebauthn/server'
import type { AuthenticatorTransport } from '@simplewebauthn/server'
import { isoUint8Array } from '@simplewebauthn/server/helpers'
import { db } from '../../../database/client'
import { webauthnCredentials } from '../../../database/schema'
import { webauthnRegisterOptionsSchema } from '#shared/schemas/webauthn'
import {
  emitirChallenge,
  exigirPinValido,
  getRpInfo
} from '../../../utils/webauthn'

/**
 * POST /api/auth/webauthn/register-options
 * Inicia el enrolamiento: exige usuario+PIN válidos (el trabajador no tiene
 * JWT, así que el PIN viaja en cada paso sensible) y devuelve las options
 * para startRegistration() en el navegador.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const parsed = webauthnRegisterOptionsSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Datos inválidos.', data: parsed.error.flatten() })
  }

  const usuario = await exigirPinValido(parsed.data.nombre_usuario, parsed.data.pin)
  const { rpID } = getRpInfo(event)

  const existentes = await db
    .select({ credentialId: webauthnCredentials.credentialId, transports: webauthnCredentials.transports })
    .from(webauthnCredentials)
    .where(eq(webauthnCredentials.usuarioId, usuario.id))

  const options = await generateRegistrationOptions({
    rpName: 'MiQuiosco',
    rpID,
    userName: usuario.nombre,
    userID: isoUint8Array.fromUTF8String(usuario.id),
    attestationType: 'none',
    excludeCredentials: existentes.map(c => ({
      id: c.credentialId,
      transports: (c.transports ?? ['internal']) as AuthenticatorTransport[]
    })),
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      userVerification: 'required',
      residentKey: 'discouraged'
    }
  })

  await emitirChallenge(usuario.id, 'registration', options.challenge)
  return options
})
