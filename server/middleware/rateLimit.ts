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

export default defineEventHandler((event) => {
  if (event.path !== '/api/auth/login' || event.method !== 'POST') return

  const ip = getRequestHeader(event, 'x-forwarded-for')?.split(',')[0]?.trim()
    || getRequestHeader(event, 'x-real-ip')
    || '127.0.0.1'

  const now = Date.now()
  const entry = attempts.get(ip)

  if (entry && now < entry.resetAt) {
    if (entry.count >= MAX_ATTEMPTS) {
      throw createError({
        statusCode: 429,
        statusMessage: 'Demasiados intentos. Intenta de nuevo en 1 minuto.'
      })
    }
    entry.count++
  } else {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS })
  }

  event.node.res.once('finish', () => {
    if (event.node.res.statusCode === 200) {
      attempts.delete(ip)
    }
  })
})
