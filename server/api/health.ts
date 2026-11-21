/**
 * GET /api/health — sonda pública de vida del servidor.
 *
 * `timestamp` es el instante del servidor en epoch ms. Además de servir al
 * botón "Probar conexión" de Ajustes, es lo que usa el teléfono para medir su
 * desfase de reloj (useReloj): la hora de negocio la marca el servidor, no el
 * aparato, porque en Cuba el cambio de hora se decidió no aplicar y muchos
 * teléfonos quedaron una hora adelantados.
 */
export default defineEventHandler(() => ({
  status: 'ok',
  timestamp: Date.now()
}))
