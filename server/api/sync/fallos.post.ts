import { requireAuth } from '../../utils/auth'
import { exigirDispositivoActivo, HEADER_VERSION_CODE } from '../../utils/dispositivo'
import { registrarFallos } from '../../utils/syncFallos'
import { fallosSyncSchema } from '#shared/syncFallos'

/**
 * POST /api/sync/fallos
 *
 * Buzón del dispositivo: el APK sube los fallos que guardó localmente (lotes de
 * hasta 100). El servidor los deduplica por `(puesto, clave)` e incrementa
 * `intentos`, así el panel ve "este error lleva 37 veces" en vez de 37 filas.
 *
 * Es telemetría: nunca debe romper la sincronización. Si el cuerpo no valida,
 * responde 400 y el APK conserva su copia para reintentar.
 */
export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event, 'sync')
  const puestoId = auth.usuario.puestoId
  await exigirDispositivoActivo(event, puestoId)

  const body = await readBody(event).catch(() => ({}))
  const parsed = fallosSyncSchema.safeParse(body ?? {})
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Payload inválido.',
      data: parsed.error.flatten()
    })
  }

  const guardados = await registrarFallos(
    puestoId,
    auth.dispositivoId,
    parsed.data.fallos,
    { appVersion: getHeader(event, HEADER_VERSION_CODE) }
  )

  return { ok: true, guardados }
})
