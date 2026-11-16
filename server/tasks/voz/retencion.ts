import { leerVozConfig } from '../../utils/vozConfig'
import { limpiarEventosVoz } from '../../utils/vozEventos'

/**
 * Retención de los eventos de voz.
 *
 * Corre cada noche (ver `nitro.scheduledTasks` en `nuxt.config.ts`). La
 * cantidad de días la fija el super_admin en la configuración de flota; el
 * botón «Depurar» del panel usa la misma política.
 */
export default defineTask({
  meta: {
    name: 'voz:retencion',
    description: 'Borra eventos de voz antiguos según la retención de flota'
  },
  async run() {
    const config = await leerVozConfig()
    const eliminados = await limpiarEventosVoz({ dias: config.retencionDias })
    return { result: { eliminados, dias: config.retencionDias } }
  }
})
