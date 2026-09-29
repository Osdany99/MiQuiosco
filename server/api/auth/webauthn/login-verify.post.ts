import { and, eq } from 'drizzle-orm'
import {
  verifyAuthenticationResponse
} from '@simplewebauthn/server'
import type { AuthenticationResponseJSON, AuthenticatorTransport } from '@simplewebauthn/server'
import { isoBase64URL } from '@simplewebauthn/server/helpers'
import { db } from '../../../database/client'
import { webauthnCredentials } from '../../../database/schema'
import { webauthnLoginVerifySchema } from '#shared/schemas/webauthn'
import {
  buscarUsuarioPorNombre,
  consumirChallenge,
  credencialesInvalidas,
  emitirRespuestaLogin,
  getRpInfo
} from '../../../utils/webauthn'

/**
 * POST /api/auth/webauthn/login-verify
 * Verifica la assertion, actualiza el counter (detección de clonación) y
 * devuelve la misma respuesta que el login con PIN.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const parsed = webauthnLoginVerifySchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Datos inválidos.', data: parsed.error.flatten() })
  }

  const usuario = await buscarUsuarioPorNombre(parsed.data.nombre_usuario)
  if (!usuario || !usuario.activo) credencialesInvalidas()

  const respuesta = parsed.data.respuesta as unknown as AuthenticationResponseJSON
  const rows = await db
    .select()
    .from(webauthnCredentials)
    .where(and(
      eq(webauthnCredentials.usuarioId, usuario.id),
      eq(webauthnCredentials.credentialId, respuesta.id)
    ))
  const cred = rows[0]
  if (!cred) credencialesInvalidas()

  const challenge = await consumirChallenge(usuario.id, 'authentication')
  if (!challenge) {
    throw createError({ statusCode: 400, statusMessage: 'Sesión expirada. Pide las opciones de nuevo.' })
  }

  const { rpID, origin } = getRpInfo(event)
  let verification
  try {
    verification = await verifyAuthenticationResponse({
      response: respuesta,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: cred.credentialId,
        publicKey: isoBase64URL.toBuffer(cred.publicKey),
        counter: cred.counter,
        transports: (cred.transports ?? ['internal']) as AuthenticatorTransport[]
      },
      requireUserVerification: true
    })
  } catch {
    credencialesInvalidas()
  }

  const { verified, authenticationInfo } = verification
  if (!verified) credencialesInvalidas()

  await db.update(webauthnCredentials)
    .set({ counter: authenticationInfo.newCounter, actualizadoEn: new Date() })
    .where(eq(webauthnCredentials.id, cred.id))

  return await emitirRespuestaLogin(event, usuario)
})
