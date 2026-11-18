import { eq } from 'drizzle-orm'
import { db } from '../../../database/client'
import { lotes } from '../../../database/schema'
import { estadoLoteSchema } from '#shared/schemas/lote'
import { requireRole } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const id = event.context.params!.id as string
  const body = await readBody(event)
  const parsed = estadoLoteSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Estado de lote inválido.' })
  }

  const [lote] = await db.select().from(lotes).where(eq(lotes.id, id)).limit(1)
  if (!lote || lote.puestoId !== auth.usuario.puestoId) {
    throw createError({ statusCode: 404, statusMessage: 'Lote no encontrado.' })
  }

  const [actualizado] = await db
    .update(lotes)
    .set({
      estadoLote: parsed.data.estadoLote,
      actualizadoEn: new Date()
    })
    .where(eq(lotes.id, id))
    .returning()

  if (!actualizado) {
    throw createError({ statusCode: 404, statusMessage: 'Lote no encontrado.' })
  }

  return {
    ...actualizado,
    creadoEn: actualizado.creadoEn.toISOString(),
    actualizadoEn: actualizado.actualizadoEn.toISOString()
  }
})
