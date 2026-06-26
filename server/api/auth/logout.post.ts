import { revokeToken } from '../../utils/auth'

/**
 * POST /api/auth/logout
 *
 * Invalida el token JWT del lado del servidor (añadiéndolo a la blacklist)
 * y limpia cualquier estado de sesión.
 *
 * El cliente debe borrar sus tokens locales (@capacitor/preferences) después
 * de llamar a este endpoint.
 */
export default defineEventHandler((event) => {
  const header = getHeader(event, 'authorization')
  if (header?.startsWith('Bearer ')) {
    const token = header.slice(7)
    revokeToken(token)
  }

  return { ok: true }
})
