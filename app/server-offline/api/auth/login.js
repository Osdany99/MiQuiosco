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
  try {
    const db = useDb()
    const usuario = await db.getUsuarioPorNombreLocal(nombreUsuario)

    if (!usuario) return { ok: false, motivo: 'usuario_no_existe' }
    if (!usuario.activo) return { ok: false, motivo: 'usuario_inactivo' }

    // Solo el jefe entra a la app (decision de producto, Fase 3): el
    // trabajador se gestiona (turno, salario) pero no inicia sesion.
    if (usuario.rol !== 'jefe') {
      return { ok: false, motivo: 'solo_jefe' }
    }

    const pinOk = await verifyPin(pin, usuario.pinHash)
    if (!pinOk) return { ok: false, motivo: 'pin_incorrecto' }

    return { ok: true, usuario }
  } catch (err) {
    console.error('Login offline error:', err)
    return { ok: false, motivo: 'error_interno' }
  }
}
