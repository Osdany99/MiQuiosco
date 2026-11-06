import { resetPinAdminSchema } from '#shared/schemas/admin'

/**
 * POST /api/admin/usuarios/:id/reset-pin
 *
 * Guarda el PIN nuevo e incrementa `token_version`, lo que invalida al instante
 * los JWT abiertos del usuario. Si el super admin se resetea el PIN a sí mismo,
 * su propio token también deja de valer y la respuesta lo avisa.
 */
export default defineEventHandler(async (event) => {
  const auth = await requireSuperAdmin(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Falta el id del usuario.' })
  }

  const body = await readBody(event).catch(() => ({}))
  const parsed = resetPinAdminSchema.safeParse(body ?? {})
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'PIN inválido.',
      data: parsed.error.flatten()
    })
  }

  const fila = await resetPinAdmin(id, parsed.data.pin)

  return {
    ok: true,
    id: fila?.id,
    tokenVersion: fila?.tokenVersion,
    requiereReLogin: id === auth.usuario.id
  }
})
