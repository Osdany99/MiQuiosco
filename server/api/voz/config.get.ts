import { requireAuth } from '../../utils/auth'
import { exigirDispositivoActivo } from '../../utils/dispositivo'
import { leerVozConfig } from '../../utils/vozConfig'

/**
 * GET /api/voz/config — configuración de flota que aplican los equipos.
 *
 * Cualquier usuario autenticado puede leerla (la necesita el jefe para
 * arrancar la escucha en segundo plano). La copia local vive en Preferences:
 * sin red se usa la última descargada o los valores por defecto.
 */
export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event, 'sync')
  await exigirDispositivoActivo(event, auth.usuario.puestoId)
  const config = await leerVozConfig()
  return { schema: 1, config }
})
