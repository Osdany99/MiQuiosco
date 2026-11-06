import { resolverFalloAdminSchema } from '#shared/schemas/admin'

/**
 * PATCH /api/admin/fallos/:id
 *
 * Cierra el fallo (`resuelto: true`) o lo reabre (`resuelto: false`). No toca
 * los datos del dispositivo: la fila que falló sigue reintentándose en cada
 * sync hasta que se corrija en el APK.
 */
export default defineEventHandler(async (event) => {
  const auth = await requireSuperAdmin(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Falta el id del fallo.' })
  }

  const body = await readBody(event).catch(() => ({}))
  const parsed = resolverFalloAdminSchema.safeParse(body ?? {})
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Datos del fallo inválidos.',
      data: parsed.error.flatten()
    })
  }

  return await resolverFalloAdmin(id, parsed.data, auth.usuario.id)
})
