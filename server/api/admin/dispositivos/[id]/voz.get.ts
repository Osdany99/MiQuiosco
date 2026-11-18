import { leerVozDispositivoAdmin } from '../../../../utils/vozConfig'

/**
 * GET /api/admin/dispositivos/:id/voz
 *
 * Bloque «voz de este equipo» del panel: la flota (valor por defecto), el
 * override del aparato si existe, la configuración efectiva y lo que el propio
 * equipo reportó (motor en uso, si tiene Vosk, si tiene STT del sistema).
 */
export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Falta el id del dispositivo.' })
  }

  return await leerVozDispositivoAdmin(id)
})
