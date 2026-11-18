import { limpiarEventosVoz } from './vozEventos'
import { limpiarAciertosVoz } from './vozAciertos'
import { leerVozConfig } from './vozConfig'

/**
 * Retención de la telemetría de voz.
 *
 * La usan la tarea programada de Nitro (`voz:retencion`) y el endpoint de cron
 * externo (`POST /api/tasks/voz/retencion`), para que la política sea la misma
 * por los dos caminos. Los días los fija el super_admin en la configuración de
 * flota. Fallos y aciertos tienen retención propia.
 */
export async function ejecutarRetencionVoz() {
  const config = await leerVozConfig()
  const dias = Number(config?.retencionDias) || 30
  const diasAciertos = Number(config?.retencionAciertosDias) || 7
  const eliminados = await limpiarEventosVoz({ dias })
  const aciertos = await limpiarAciertosVoz({ dias: diasAciertos })
  return { eliminados, aciertos, dias, diasAciertos }
}
