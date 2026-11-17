import { timingSafeEqual } from 'node:crypto'
import { ejecutarRetencionVoz } from '../../../utils/vozRetencion'

/**
 * Cron externo de la retención de voz.
 *
 * En Vercel (serverless) no hay proceso permanente y `nitro.scheduledTasks` no
 * corre solo: este endpoint es el que dispara el cron (`vercel.json` →
 * `crons`). También sirve para un crontab propio:
 *
 *   curl -fsS -X POST -H "x-voz-cron-secret: $CRON_SECRET" \
 *     https://<host>/api/tasks/voz/retencion
 *
 * Sin `CRON_SECRET` configurado responde 503 y no borra nada: un endpoint de
 * mantenimiento abierto por olvido sería peor que no tenerlo.
 */
function igualSegura(a: string, b: string) {
  const bufferA = Buffer.from(a)
  const bufferB = Buffer.from(b)
  return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB)
}

export default defineEventHandler(async (event) => {
  // Se lee de `process.env` al atender: `runtimeConfig` se resuelve en el build
  // y un secreto rotado después no se aplicaría.
  const esperado = String(process.env.CRON_SECRET || '')
  if (!esperado) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Cron de voz sin configurar (CRON_SECRET).'
    })
  }

  // Vercel Cron manda `Authorization: Bearer <CRON_SECRET>`; un crontab propio
  // puede usar la cabecera dedicada.
  const autorizacion = getHeader(event, 'authorization') || ''
  const porCabecera = getHeader(event, 'x-voz-cron-secret') || ''
  const autorizado = igualSegura(autorizacion, `Bearer ${esperado}`)
    || igualSegura(porCabecera, esperado)
  if (!autorizado) {
    throw createError({ statusCode: 401, statusMessage: 'No autorizado.' })
  }

  const { eliminados, dias } = await ejecutarRetencionVoz()
  return { ok: true, eliminados, dias }
})
