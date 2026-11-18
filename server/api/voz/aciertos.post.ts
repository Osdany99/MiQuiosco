import { requireAuth } from '../../utils/auth'
import { exigirDispositivoActivo, HEADER_VERSION_CODE } from '../../utils/dispositivo'
import { registrarAciertosVoz } from '../../utils/vozAciertos'
import { leerVozConfig } from '../../utils/vozConfig'
import { aciertosVozSchema } from '#shared/schemas/vozAciertos'

/**
 * POST /api/voz/aciertos — sube los dictados que la app resolvió bien.
 *
 * La flota decide si se guardan: con `capturarAciertos` apagado el servidor
 * responde ok pero descarta todo. Igual que con los fallos, el cliente no
 * puede imponer la captura.
 */
export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event, 'sync')
  const puestoId = auth.usuario.puestoId
  await exigirDispositivoActivo(event, puestoId)

  const body = await readBody(event).catch(() => ({}))
  const parsed = aciertosVozSchema.safeParse(body ?? {})
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Payload inválido.',
      data: parsed.error.flatten()
    })
  }

  const config = await leerVozConfig()
  if (config.capturarAciertos !== true) return { ok: true, guardados: 0, captura: false }

  const guardados = await registrarAciertosVoz(
    puestoId,
    auth.dispositivoId,
    parsed.data.aciertos,
    {
      appVersion: getHeader(event, HEADER_VERSION_CODE),
      capturarTexto: true
    }
  )

  return { ok: true, guardados, captura: true }
})
