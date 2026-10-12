import { eq, and, desc } from 'drizzle-orm'
import { db } from '../../database/client'
import { lotes, movimientosInventario } from '../../database/schema'
import { saldosDeLote } from '#shared/inventario/operaciones'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const query = getQuery(event)
  const productoId = typeof query.productoId === 'string' ? query.productoId : null

  const conds = [eq(lotes.puestoId, auth.usuario.puestoId)]
  if (productoId) conds.push(eq(lotes.productoId, productoId))

  const filas = await db
    .select()
    .from(lotes)
    .where(and(...conds))
    .orderBy(desc(lotes.fechaEntrada), desc(lotes.creadoEn))

  const movs = await db
    .select()
    .from(movimientosInventario)
    .where(
      and(
        eq(movimientosInventario.puestoId, auth.usuario.puestoId),
        eq(movimientosInventario.anulado, false)
      )
    )

  return filas.map((l) => {
    // Misma regla que el camino offline (saldosDeLote), para que el diálogo de
    // corrección muestre el mismo piso en los dos modos.
    const s = saldosDeLote(l, movs)
    return {
      ...l,
      fechaEntrada: l.fechaEntrada,
      creadoEn: l.creadoEn.toISOString(),
      actualizadoEn: l.actualizadoEn.toISOString(),
      // Lote sin ningún movimiento (datos importados a mano): se muestra lo que
      // dice la cabecera, como siempre. Para corregirlo el diálogo avisa de que
      // el libro no tiene su entrada.
      saldoAlmacen: movs.some(m => m.loteId === l.id) ? s.almacen : l.cantidadInicial,
      saldoQuiosco: s.quiosco,
      conConsumo: s.consumido,
      salidasAlmacen: s.salidasAlmacen,
      piso: s.piso
    }
  })
})
