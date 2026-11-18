import { requireSuperAdmin } from '../../../../utils/auth'
import { limpiarAciertosVoz } from '../../../../utils/vozAciertos'

/**
 * POST /api/admin/voz/aciertos/limpiar — vacía los aciertos guardados.
 *
 * Es diagnóstico temporal: cuando el super_admin termina de probar, borra todo
 * sin esperar a la retención.
 */
export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const eliminados = await limpiarAciertosVoz({ todos: true })
  return { ok: true, eliminados }
})
