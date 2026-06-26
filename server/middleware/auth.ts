import { verifyToken } from '../utils/auth'

/**
 * Middleware global de servidor.
 *
 * No bloquea ninguna ruta: simplemente intenta extraer el token del header
 * Authorization y, si es válido, lo deja disponible en `event.context.auth`
 * para que los endpoints individuales decidan si lo exigen.
 *
 * Los endpoints usan `requireAuth(event, scope)` o `requireRole(event, ...)`
 * desde `server/utils/auth.ts` para aplicar la restricción correspondiente.
 */
export default defineEventHandler((event) => {
  // Solo procesamos rutas /api/*
  if (!event.path?.startsWith('/api/')) return

  const header = getHeader(event, 'authorization')
  if (!header || !header.startsWith('Bearer ')) return

  const token = header.slice(7)
  const payload = verifyToken(token)
  if (!payload) return

  event.context.auth = {
    token,
    payload
  }
})
