import { requireAuth } from '../../utils/auth'
import {
  actualizarEstadoDispositivo,
  exigirDispositivoActivo,
  leerDispositivoId
} from '../../utils/dispositivo'
import { syncEstadoSchema } from '#shared/schemas/syncEstado'

/**
 * POST /api/sync/estado
 *
 * "Latido" del dispositivo: el APK lo llama al arrancar y al terminar cada
 * sincronización. Actualiza `dispositivos` (última conexión, pendientes,
 * última sync OK y modelo/Android) y sirve para que el panel de super admin
 * vea qué equipos están sanos.
 *
 * Es telemetría: un fallo de validación no debe romper la sync, pero el
 * endpoint sí rechaza dispositivos revocados (403) para que el APK se entere.
 */
export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event, 'sync')

  // Web o APK antigua sin identidad de dispositivo: no hay nada que reportar.
  if (!leerDispositivoId(event)) {
    return { ok: true, dispositivo: false, revocado: false }
  }

  // Lanza 403 si el equipo fue revocado o pertenece a otro puesto.
  await exigirDispositivoActivo(event, auth.usuario.puestoId)

  const body = await readBody(event).catch(() => ({}))
  const parsed = syncEstadoSchema.safeParse(body ?? {})
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Payload inválido.',
      data: parsed.error.flatten()
    })
  }

  const { pendientes, syncOk, modelo, android } = parsed.data

  const dispositivoId = await actualizarEstadoDispositivo(event, auth.usuario.puestoId, {
    ...(pendientes != null ? { pendientes } : {}),
    syncOk: syncOk === true,
    modelo: modelo ?? null,
    android: android ?? null
  })

  return { ok: true, dispositivo: !!dispositivoId, revocado: false }
})
