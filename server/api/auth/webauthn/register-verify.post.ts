import {
  verifyRegistrationResponse
} from '@simplewebauthn/server'
import type { RegistrationResponseJSON } from '@simplewebauthn/server'
import { isoBase64URL } from '@simplewebauthn/server/helpers'
import { db } from '../../../database/client'
import { webauthnCredentials } from '../../../database/schema'
import { webauthnRegisterVerifySchema } from '#shared/schemas/webauthn'
import {
  buscarUsuarioPorNombre,
  consumirChallenge,
  credencialesInvalidas,
  getRpInfo
} from '../../../utils/webauthn'

/**
 * POST /api/auth/webauthn/register-verify
 * Verifica la attestation y guarda la credencial (clave pública + counter).
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const parsed = webauthnRegisterVerifySchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Datos inválidos.', data: parsed.error.flatten() })
  }

  const usuario = await buscarUsuarioPorNombre(parsed.data.nombre_usuario)
  if (!usuario || !usuario.activo) credencialesInvalidas()

  const challenge = await consumirChallenge(usuario.id, 'registration')
  if (!challenge) {
    throw createError({ statusCode: 400, statusMessage: 'Sesión expirada. Pide las opciones de nuevo.' })
  }

  const { rpID, origin } = getRpInfo(event)
  const respuesta = parsed.data.respuesta as unknown as RegistrationResponseJSON
  let verification
  try {
    verification = await verifyRegistrationResponse({
      response: respuesta,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true
    })
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'No se pudo registrar la huella en este navegador.' })
  }

  const { verified, registrationInfo } = verification
  if (!verified || !registrationInfo) {
    throw createError({ statusCode: 400, statusMessage: 'No se pudo registrar la huella en este navegador.' })
  }

  const cred = registrationInfo.credential
  const transports = respuesta.response.transports ?? ['internal']
  try {
    await db.insert(webauthnCredentials).values({
      usuarioId: usuario.id,
      credentialId: cred.id,
      publicKey: isoBase64URL.fromBuffer(cred.publicKey),
      counter: cred.counter,
      transports,
      nombreDispositivo: parsed.data.nombre_dispositivo || null
    })
  } catch {
    throw createError({ statusCode: 409, statusMessage: 'Esa huella ya está registrada para este usuario.' })
  }

  return { ok: true, credentialId: cred.id }
})
