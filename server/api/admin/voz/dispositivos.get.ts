import { listarOverridesVoz } from '../../../utils/vozConfig'

/**
 * GET /api/admin/voz/dispositivos
 *
 * Equipos con configuración de voz propia, para la tabla de
 * `/admin/voz-configuracion`. Sirve para responder «quién no está usando la
 * flota» sin abrir cada dispositivo.
 */
export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  return await listarOverridesVoz()
})
