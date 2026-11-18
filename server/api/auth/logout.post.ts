import { requireAuth, revokeToken } from '../../utils/auth'
import { registrarAccesoDispositivo } from '../../utils/dispositivo'

/**
 * POST /api/auth/logout
 *
 * El cliente borra sus tokens locales (@capacitor/preferences).
 * Este endpoint valida el token y lo revoca en la blacklist en memoria
 * (limitación: la blacklist se pierde al reiniciar el servidor; la
 * expiración del JWT de 24h sigue siendo la barrera principal).
 *
 * Además deja la traza de acceso (`accesos`) del dispositivo.
 */
export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event, 'sync')

  const header = getHeader(event, 'authorization')
  if (header?.startsWith('Bearer ')) {
    revokeToken(header.slice(7))
  }

  await registrarAccesoDispositivo(event, {
    puestoId: auth.usuario.puestoId,
    usuarioId: auth.usuario.id,
    tipo: 'logout'
  }).catch((err) => {
    // La auditoría no debe impedir cerrar sesión.
    console.error('[logout] no se pudo registrar el acceso:', err)
  })

  return { ok: true }
})
