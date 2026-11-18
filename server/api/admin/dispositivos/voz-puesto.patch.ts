import { guardarVozConfigPuesto } from '../../../utils/vozConfig'
import { vozConfigPuestoSchema } from '#shared/schemas/vozConfig'

/**
 * PATCH /api/admin/dispositivos/voz-puesto
 *
 * Aplica el mismo override de voz a todos los equipos de un puesto —o lo limpia
 * si viene todo en `null`—. Es el atajo «todo el puesto usa Vosk» sin tener que
 * entrar equipo por equipo.
 *
 * Ojo: un equipo que se agregue al puesto después hereda la flota, no esta
 * elección; se vuelve a aplicar desde aquí en dos toques.
 */
export default defineEventHandler(async (event) => {
  const auth = await requireSuperAdmin(event)

  const body = await readBody(event).catch(() => ({}))
  const parsed = vozConfigPuestoSchema.safeParse(body ?? {})
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Configuración de voz del puesto inválida.',
      data: parsed.error.flatten()
    })
  }

  const { puestoId, ...datos } = parsed.data
  const aplicados = await guardarVozConfigPuesto(puestoId, datos, auth.usuario.id)
  return { ok: true, aplicados }
})
