import { requireAuth } from '../../utils/auth'

/**
 * POST /api/auth/logout
 *
 * El cliente borra sus tokens locales (@capacitor/preferences).
 * Este endpoint solo valida que el token sea válido.
 */
export default defineEventHandler(async (event) => {
  await requireAuth(event, 'sync')
  return { ok: true }
})
