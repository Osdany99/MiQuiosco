import { requireSuperAdmin } from '../../utils/auth'
import { guardarVozConfig } from '../../utils/vozConfig'
import { vozConfigSchema } from '#shared/schemas/vozConfig'

/**
 * PUT /api/voz/config — cambia la configuración de flota (solo super_admin).
 *
 * Cada guardado incrementa `version`, que es lo que usan los equipos para
 * decidir si deben volver a aplicar los valores locales.
 */
export default defineEventHandler(async (event) => {
  const auth = await requireSuperAdmin(event)
  const body = await readBody(event).catch(() => ({}))
  const parsed = vozConfigSchema.safeParse(body ?? {})
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Configuración de voz inválida.',
      data: parsed.error.flatten()
    })
  }

  const config = await guardarVozConfig(parsed.data, auth.usuario.id)
  return { ok: true, config }
})
