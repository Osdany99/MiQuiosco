import { actualizarJefeAdminSchema } from '#shared/schemas/admin'

/**
 * PATCH /api/admin/usuarios/:id
 *
 * Edita al jefe de un puesto (nombre, contacto, activo, salario). El PIN se
 * cambia con `POST /api/admin/usuarios/:id/reset-pin`.
 */
export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Falta el id del usuario.' })
  }

  const body = await readBody(event).catch(() => ({}))
  const parsed = actualizarJefeAdminSchema.safeParse(body ?? {})
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Datos del jefe inválidos.',
      data: parsed.error.flatten()
    })
  }

  try {
    return await actualizarJefeAdmin(id, parsed.data)
  } catch (err) {
    if (esConflictoUnico(err)) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Ya existe un usuario con ese nombre.'
      })
    }
    throw err
  }
})
