import { limpiarEventosVoz } from './vozEventos'
import { leerVozConfig } from './vozConfig'

/**
 * Retención de los eventos de voz.
 *
 * La usan la tarea programada de Nitro (`voz:retencion`) y el endpoint de cron
 * externo (`POST /api/tasks/voz/retencion`), para que la política sea la misma
 * por los dos caminos. Los días los fija el super_admin en la configuración de
 * flota, igual que el botón «Depurar» del panel.
 */
export async function ejecutarRetencionVoz() {
  const config = await leerVozConfig()
  const dias = Number(config?.retencionDias) || 30
  const eliminados = await limpiarEventosVoz({ dias })
  return { eliminados, dias }
}
