const attempts = new Map<string, { count: number, resetAt: number }>()

const MAX_ATTEMPTS = 5
const WINDOW_MS = 60 * 1000 // 1 minuto
const CLEANUP_INTERVAL = 5 * 60 * 1000

const cleanupTimer = setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of attempts) {
    if (now > entry.resetAt) attempts.delete(key)
  }
}, CLEANUP_INTERVAL)
// No mantener vivo el proceso (build/prerender deben poder terminar)
if (typeof cleanupTimer.unref === 'function') cleanupTimer.unref()

/**
 * Rutas POST con secreto adivinable (PIN de 4-6 digitos) que necesitan limite
 * de intentos por IP. Antes solo cubria /api/auth/login y los 6 endpoints de
 * WebAuthn quedaban como superficie de fuerza bruta ilimitada: register y
 * login con PIN se podian martillear sin 429.
 *
 * Se matchea por prefijo /api/auth/ a proposito: cualquier endpoint futuro de
 * autenticacion con PIN queda protegido sin tocar este archivo. El logout
 * tambien cae dentro, lo cual es inofensivo (un 429 en logout solo retrasa un
 * logout, y el cliente limpia la sesion local de todos modos).
 */
function esRutaProtegida(path: string, method: string): boolean {
  return method === 'POST' && path.startsWith('/api/auth/')
}

export default defineEventHandler((event) => {
  if (!esRutaProtegida(event.path, event.method)) return

  const ip = getRequestHeader(event, 'x-forwarded-for')?.split(',')[0]?.trim()
    || getRequestHeader(event, 'x-real-ip')
    || '127.0.0.1'

  // La cuota es POR RUTA además de por IP: saturar el login no bloquea el
  // WebAuthn y viceversa. Sin esto, los tests de un endpoint contaminarian los
  // de otro (y un atacante bloqueado en login no podria seguir por WebAuthn,
  // pero un usuario legitimo que fallo el PIN 5 veces tampoco podria usar su
  // huella: separadas, cada una protege lo suyo).
  const clave = `${ip} ${event.path}`

  const now = Date.now()
  const entry = attempts.get(clave)

  if (entry && now < entry.resetAt) {
    if (entry.count >= MAX_ATTEMPTS) {
      throw createError({
        statusCode: 429,
        statusMessage: 'Demasiados intentos. Intenta de nuevo en 1 minuto.'
      })
    }
    entry.count++
  } else {
    attempts.set(clave, { count: 1, resetAt: now + WINDOW_MS })
  }

  event.node.res.once('finish', () => {
    if (event.node.res.statusCode === 200) {
      attempts.delete(clave)
    }
  })
})
