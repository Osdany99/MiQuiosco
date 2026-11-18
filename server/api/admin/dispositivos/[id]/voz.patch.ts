import {
  guardarVozConfigDispositivo,
  leerVozConfig
} from '../../../../utils/vozConfig'
import { vozConfigDispositivoSchema } from '#shared/schemas/vozConfig'

/**
 * PATCH /api/admin/dispositivos/:id/voz
 *
 * Cambia el override de voz de un equipo. `null` en un campo = hereda de la
 * flota; todo en `null` borra la fila. El equipo aplica el cambio en su próximo
 * sync (y en caliente si está abierto, vía `ACTION_CONFIGURAR` del servicio).
 */
export default defineEventHandler(async (event) => {
  const auth = await requireSuperAdmin(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Falta el id del dispositivo.' })
  }

  const body = await readBody(event).catch(() => ({}))
  const parsed = vozConfigDispositivoSchema.safeParse(body ?? {})
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Configuración de voz del equipo inválida.',
      data: parsed.error.flatten()
    })
  }

  const override = await guardarVozConfigDispositivo(id, parsed.data, auth.usuario.id)
  const efectiva = await leerVozConfig(id)
  return { ok: true, override, efectiva }
})
