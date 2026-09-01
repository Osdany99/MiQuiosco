import { requireAuth, revokeToken } from '../../utils/auth'

/**
 * POST /api/auth/logout
 *
 * El cliente borra sus tokens locales (@capacitor/preferences).
 * Este endpoint valida el token y lo revoca en la blacklist en memoria
 * (limitación: la blacklist se pierde al reiniciar el servidor; la
 * expiración del JWT de 24h sigue siendo la barrera principal).
 */
export default defineEventHandler(async (event) => {
  await requireAuth(event, 'sync')

  const header = getHeader(event, 'authorization')
  if (header?.startsWith('Bearer ')) {
    revokeToken(header.slice(7))
  }

  return { ok: true }
})
