/**
 * utils-offline/auth.js — Hashing y verificación de PIN, guardia de rol.
 *
 * Espejo offline de server/utils/auth.ts (que opera sobre Postgres).
 * Usa bcryptjs (compilable en el cliente) en vez de bcrypt nativo.
 */
import bcrypt from 'bcryptjs'

const SALT_ROUNDS = 10

/**
 * Hashea un PIN en claro.
 * @param {string} pin
 * @returns {Promise<string>}
 */
export function hashPin(pin) {
  return bcrypt.hash(String(pin), SALT_ROUNDS)
}

/**
 * Verifica un PIN contra un hash.
 * @param {string} pin
 * @param {string} pinHash
 * @returns {Promise<boolean>}
 */
export function verifyPin(pin, pinHash) {
  return bcrypt.compare(String(pin), String(pinHash))
}

/**
 * Lanza un error si el usuario actual no es jefe.
 * Pensado para uso desde create.js / update.js / remove.js offline.
 * @param {{ usuarioActual: { value: { rol?: string } } }} auth
 */
export function requireJefe(auth) {
  const rol = auth?.usuarioActual?.value?.rol
  if (rol !== 'jefe') {
    const err = new Error('Operación solo permitida al jefe')
    err.statusCode = 403
    throw err
  }
}
