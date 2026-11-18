import { requireAuth } from '../../utils/auth'
import { exigirDispositivoActivo } from '../../utils/dispositivo'
import { leerVozConfig } from '../../utils/vozConfig'

/**
 * GET /api/voz/config — configuración de voz que aplica ESTE equipo.
 *
 * Cualquier usuario autenticado puede leerla (la necesita el jefe para
 * arrancar la escucha en segundo plano). El servidor resuelve aquí el override
 * del equipo (`voz_config_dispositivo`) sobre los valores de flota, así que el
 * APK ya instalado no tiene que saber que existen dos niveles.
 *
 * `schema` sigue en 1 a propósito: los aparatos con APK vieja validan ese
 * número y los campos nuevos (`origen`, `versionFlota`, `versionDispositivo`)
 * les son indiferentes.
 *
 * La copia local vive en Preferences: sin red se usa la última descargada o los
 * valores por defecto.
 */
export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event, 'sync')
  const dispositivoId = await exigirDispositivoActivo(event, auth.usuario.puestoId)
  const config = await leerVozConfig(dispositivoId)
  return { schema: 1, config }
})
