import { requireSuperAdmin } from '../../../utils/auth'
import { limpiarEventosVoz } from '../../../utils/vozEventos'
import { limpiarAciertosVoz } from '../../../utils/vozAciertos'
import { leerVozConfig } from '../../../utils/vozConfig'

/**
 * POST /api/admin/voz/limpiar — depura fallos y aciertos con la retención de
 * flota. Para vaciar los aciertos de golpe está el botón de su pestaña.
 */
export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const config = await leerVozConfig()
  const eliminados = await limpiarEventosVoz({ dias: config.retencionDias })
  const aciertos = await limpiarAciertosVoz({ dias: config.retencionAciertosDias })
  return {
    ok: true,
    eliminados,
    aciertos,
    dias: config.retencionDias,
    diasAciertos: config.retencionAciertosDias
  }
})
