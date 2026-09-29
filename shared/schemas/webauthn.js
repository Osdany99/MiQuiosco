import { z } from 'zod'

// Respuestas WebAuthn: las genera el navegador, solo se exige que sean objetos.
const respuestaWebauthn = z.record(z.string(), z.unknown())

export const webauthnRegisterOptionsSchema = z.object({
  nombre_usuario: z.string().min(1, 'El nombre de usuario es requerido.'),
  pin: z.string().min(4).max(6),
  nombre_dispositivo: z.string().max(100).optional()
})

export const webauthnRegisterVerifySchema = z.object({
  nombre_usuario: z.string().min(1, 'El nombre de usuario es requerido.'),
  respuesta: respuestaWebauthn,
  nombre_dispositivo: z.string().max(100).optional()
})

export const webauthnLoginOptionsSchema = z.object({
  nombre_usuario: z.string().min(1, 'El nombre de usuario es requerido.')
})

export const webauthnLoginVerifySchema = z.object({
  nombre_usuario: z.string().min(1, 'El nombre de usuario es requerido.'),
  respuesta: respuestaWebauthn
})

export const webauthnCredentialsListSchema = z.object({
  nombre_usuario: z.string().min(1, 'El nombre de usuario es requerido.'),
  pin: z.string().min(4).max(6)
})

export const webauthnCredentialsDeleteSchema = z.object({
  nombre_usuario: z.string().min(1, 'El nombre de usuario es requerido.'),
  pin: z.string().min(4).max(6),
  credential_id: z.string().min(1)
})
