import { requireAuth } from '../../utils/auth'
import { exigirDispositivoActivo, HEADER_VERSION_CODE } from '../../utils/dispositivo'
import { registrarEventosVoz } from '../../utils/vozEventos'
import { eventosVozCounterSchema } from '#shared/schemas/vozEventos'

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event, 'sync')
  const puestoId = auth.usuario.puestoId
  await exigirDispositivoActivo(event, puestoId)

  const body = await readBody(event).catch(() => ({}))
  const parsed = eventosVozCounterSchema.safeParse(body ?? {})
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Payload inválido.',
      data: parsed.error.flatten()
    })
  }

  const guardados = await registrarEventosVoz(
    puestoId,
    auth.dispositivoId,
    parsed.data.eventos,
    { appVersion: getHeader(event, HEADER_VERSION_CODE) }
  )

  return { ok: true, guardados }
})
