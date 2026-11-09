import { requireAuth } from '../../utils/auth'
import { exigirDispositivoActivo } from '../../utils/dispositivo'
import { db } from '../../database/client'
import { vozConfirmaciones } from '../../database/schema'
import { vozConfirmacionSchema } from '#shared/schemas/vozConfirmacion'

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event, 'sync')
  const puestoId = auth.usuario.puestoId
  await exigirDispositivoActivo(event, puestoId)

  const body = await readBody(event).catch(() => ({}))
  const parsed = vozConfirmacionSchema.safeParse(body ?? {})
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Payload inválido.',
      data: parsed.error.flatten()
    })
  }
  const data = parsed.data

  await db.insert(vozConfirmaciones).values({
    puestoId,
    dispositivoId: auth.dispositivoId ?? null,
    productoId: data.productoId ?? null,
    productoNombre: data.productoNombre ?? null,
    cantidad: data.cantidad ?? null,
    ubicacion: data.ubicacion ?? null,
    modo: data.modo ?? null,
    confianza: data.confianza ?? null,
    outcome: data.outcome
  })

  return { ok: true }
})
