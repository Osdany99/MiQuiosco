import { requireSuperAdmin } from '../../../utils/auth'
import { limpiarEventosVoz } from '../../../utils/vozEventos'
import { leerVozConfig } from '../../../utils/vozConfig'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const config = await leerVozConfig()
  const eliminados = await limpiarEventosVoz({ dias: config.retencionDias })
  return { ok: true, eliminados, dias: config.retencionDias }
})
