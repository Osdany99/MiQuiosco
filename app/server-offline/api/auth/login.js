/**
 * server-offline/auth/login.js
 *
 * Login offline: valida nombre + PIN contra la DB local.
 * Equivalente a server/api/auth/login.post.ts pero usando SQLite del dispositivo.
 */
import { useDb } from '../../db/client'
import { verifyPin } from '../../utils/auth'

/**
 * Intenta autenticar contra la DB local.
 * @param {string} nombreUsuario
 * @param {string} pin
 * @returns {Promise<{ok: true, usuario: object} | {ok: false, motivo: string}>}
 */
export async function login(nombreUsuario, pin) {
  const db = useDb()
  const usuario = await db.getUsuarioPorNombreLocal(nombreUsuario)

  if (!usuario) return { ok: false, motivo: 'usuario_no_existe' }
  if (!usuario.activo) return { ok: false, motivo: 'usuario_inactivo' }

  if (usuario.rol === 'cliente') {
    return { ok: false, motivo: 'cliente_no_puede_loguearse' }
  }

  const pinOk = await verifyPin(pin, usuario.pinHash)
  if (!pinOk) return { ok: false, motivo: 'pin_incorrecto' }

  return { ok: true, usuario }
}
