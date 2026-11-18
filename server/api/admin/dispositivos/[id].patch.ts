import { actualizarDispositivoAdminSchema } from '#shared/schemas/admin'

/**
 * PATCH /api/admin/dispositivos/:id
 *
 * Renombra el equipo (ej. "Caja 1") y/o lo revoca. Un dispositivo revocado
 * recibe 403 en la siguiente sincronización y en el próximo login; sus datos
 * locales no se tocan.
 */
export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Falta el id del dispositivo.' })
  }

  const body = await readBody(event).catch(() => ({}))
  const parsed = actualizarDispositivoAdminSchema.safeParse(body ?? {})
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Datos del dispositivo inválidos.',
      data: parsed.error.flatten()
    })
  }

  return await actualizarDispositivoAdmin(id, parsed.data)
})
