import { eq, and } from 'drizzle-orm'
import { db } from '../../database/client'
import { lotes, movimientosInventario } from '../../database/schema'
import { correccionLoteSchema } from '#shared/schemas/lote'
import { construirCorreccionLote } from '#shared/inventario/operaciones'
import { comoCorreccionLote } from '../../utils/inventario'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const id = event.context.params!.id as string
  const body = await readBody(event)
  const parsed = correccionLoteSchema.safeParse(body)
  if (!parsed.success) {
    const primer = parsed.error.issues[0]?.message ?? 'Datos inválidos.'
    throw createError({ statusCode: 400, statusMessage: primer, data: parsed.error.flatten() })
  }

  const [lote] = await db.select().from(lotes).where(eq(lotes.id, id)).limit(1)
  if (!lote || lote.puestoId !== auth.usuario.puestoId) {
    throw createError({ statusCode: 404, statusMessage: 'Lote no encontrado.' })
  }

  const movs = await db
    .select()
    .from(movimientosInventario)
    .where(
      and(eq(movimientosInventario.loteId, id), eq(movimientosInventario.anulado, false))
    )

  // Las reglas (hasta dónde puede bajar la cantidad, qué movimientos se
  // tocan) están en shared/inventario/operaciones.js: las mismas que aplica
  // el camino offline. Aquí solo se traducen las reglas a un error HTTP.
  let plan
  try {
    plan = comoCorreccionLote(construirCorreccionLote({ lote, movimientos: movs, datos: parsed.data, meta: { ahora: Date.now() } }))
  } catch (err) {
    throw createError({ statusCode: 409, statusMessage: (err as Error).message })
  }

  const { actualizadoEn: ts, ...camposLote } = plan.cambiosLote
  const ahora = new Date(ts)
  const [actualizado] = await db.transaction(async (tx) => {
    const [lot] = await tx
      .update(lotes)
      .set({ ...camposLote, actualizadoEn: ahora })
      .where(eq(lotes.id, id))
      .returning()

    // Solo la fila de entrada del lote: el resto del libro ya pasó y no se
    // reescribe (ver construirCorreccionLote).
    for (const { id: movId, ...campos } of plan.movimientosActualizados) {
      await tx
        .update(movimientosInventario)
        .set({ ...campos, actualizadoEn: ahora })
        .where(eq(movimientosInventario.id, movId))
    }

    return [lot]
  })
  if (!actualizado) {
    throw createError({ statusCode: 404, statusMessage: 'Lote no encontrado.' })
  }

  return {
    ...actualizado,
    creadoEn: actualizado.creadoEn.toISOString(),
    actualizadoEn: actualizado.actualizadoEn.toISOString(),
    saldoAlmacen: plan.almacen,
    saldoQuiosco: plan.quiosco,
    piso: plan.piso,
    salidasAlmacen: plan.salidasAlmacen
  }
})
