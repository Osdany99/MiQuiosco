import { requireSuperAdmin } from '../../../utils/auth'
import { limpiarEventosVoz } from '../../../utils/vozEventos'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  await limpiarEventosVoz()
  return { ok: true }
})
