import { actualizarPuestoAdminSchema } from '#shared/schemas/admin'

/**
 * PATCH /api/admin/puestos/:id
 *
 * Edita nombre/activo (y deja hueco a `permisos` para la Fase 7). Desactivar un
 * puesto bloquea nuevos logins y sincronizaciones, pero no borra nada.
 */
export default defineEventHandler(async (event) => {
  const auth = await requireSuperAdmin(event)
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Falta el id del puesto.' })
  }

  const body = await readBody(event).catch(() => ({}))
  const parsed = actualizarPuestoAdminSchema.safeParse(body ?? {})
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Datos del puesto inválidos.',
      data: parsed.error.flatten()
    })
  }

  // El super admin vive en el puesto central: desactivarlo lo dejaría fuera del
  // panel en el siguiente login.
  if (id === auth.usuario.puestoId && parsed.data.activo === false) {
    throw createError({
      statusCode: 409,
      statusMessage: 'No puedes desactivar el puesto central desde el panel.'
    })
  }

  return await actualizarPuestoAdmin(id, parsed.data)
})
