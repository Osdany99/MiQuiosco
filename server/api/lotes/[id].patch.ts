import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../../database/client'
import { lotes, movimientosInventario, productos, historialPrecios } from '../../database/schema'

const correccionLoteSchema = z.object({
  precioUnitario: z.number().min(0, 'El precio no puede ser negativo'),
  motivo: z.string().min(1, 'El motivo es obligatorio').max(200)
})

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const id = event.context.params!.id as string
  const body = await readBody(event)
  const parsed = correccionLoteSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Datos inválidos.', data: parsed.error.flatten() })
  }

  const [lote] = await db.select().from(lotes).where(eq(lotes.id, id)).limit(1)
  if (!lote || lote.puestoId !== auth.usuario.puestoId) {
    throw createError({ statusCode: 404, statusMessage: 'Lote no encontrado.' })
  }
  if (lote.anulado) {
    throw createError({ statusCode: 409, statusMessage: 'El lote está anulado.' })
  }

  const conConsumo = await tieneConsumo(id)
  if (conConsumo) {
    throw createError({
      statusCode: 409,
      statusMessage: 'El lote ya tiene movimientos de salida. Anúlalo y crea uno correcto en su lugar.'
    })
  }

  const ahora = new Date()
  const result = await db.transaction(async (tx) => {
    const [actualizado] = await tx
      .update(lotes)
      .set({ precioUnitario: parsed.data.precioUnitario, notas: lote.notas, actualizadoEn: ahora })
      .where(eq(lotes.id, id))
      .returning()

    // Los movimientos de entrada del lote conservan el costo corregido.
    const movs = await tx
      .select()
      .from(movimientosInventario)
      .where(and(eq(movimientosInventario.loteId, id), eq(movimientosInventario.anulado, false)))
    for (const m of movs) {
      await tx
        .update(movimientosInventario)
        .set({
          precioUnitario: parsed.data.precioUnitario,
          importe: Math.round(m.cantidad * parsed.data.precioUnitario * 100) / 100,
          actualizadoEn: ahora
        })
        .where(eq(movimientosInventario.id, m.id))
    }

    // Si es el lote más reciente del producto, el espejo y el historial lo siguen.
    const recientes = await tx
      .select()
      .from(lotes)
      .where(eq(lotes.productoId, lote.productoId))
      .orderBy(desc(lotes.fechaEntrada), desc(lotes.creadoEn))
      .limit(1)
    if (recientes[0]?.id === id) {
      await tx.update(productos).set({ precioCompraActual: parsed.data.precioUnitario }).where(eq(productos.id, lote.productoId))
      const vigentes = await tx
        .select()
        .from(historialPrecios)
        .where(eq(historialPrecios.productoId, lote.productoId))
        .orderBy(desc(historialPrecios.vigenteDesde))
        .limit(5)
      const vigente = vigentes.find(h => !h.vigenteHasta)
      if (vigente && Number(vigente.precioCompra) !== parsed.data.precioUnitario) {
        await tx.update(historialPrecios).set({ precioCompra: parsed.data.precioUnitario }).where(eq(historialPrecios.id, vigente.id))
      }
    }

    return actualizado
  })

  return result
})

async function tieneConsumo(loteId: string): Promise<boolean> {
  const movs = await db
    .select({
      deltaAlmacen: movimientosInventario.deltaAlmacen,
      deltaQuiosco: movimientosInventario.deltaQuiosco
    })
    .from(movimientosInventario)
    .where(and(eq(movimientosInventario.loteId, loteId), eq(movimientosInventario.anulado, false)))
  return movs.some(m => (m.deltaAlmacen ?? 0) < 0 || (m.deltaQuiosco ?? 0) < 0)
}
