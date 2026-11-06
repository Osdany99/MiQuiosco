/**
 * GET /api/admin/dispositivos/:id
 *
 * Detalle de un equipo con sus últimos 50 accesos (login/logout/activación),
 * el usuario que entró, la versión de la APK y la IP de origen.
 */
export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Falta el id del dispositivo.' })
  }

  return await obtenerDispositivoAdmin(id)
})
