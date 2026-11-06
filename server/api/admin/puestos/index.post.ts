import { crearPuestoAdminSchema } from '#shared/schemas/admin'

/**
 * POST /api/admin/puestos
 *
 * Crea el puesto y su usuario jefe en una sola operación. No hay registro
 * público: este es el único camino de alta para un local nuevo.
 */
export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const body = await readBody(event).catch(() => ({}))
  const parsed = crearPuestoAdminSchema.safeParse(body ?? {})
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Datos del puesto inválidos.',
      data: parsed.error.flatten()
    })
  }

  try {
    return await crearPuestoAdmin(parsed.data)
  } catch (err) {
    if (esConflictoUnico(err)) {
      throw createError({
        statusCode: 409,
        statusMessage: 'El nombre del jefe ya está en uso.'
      })
    }
    throw err
  }
})
