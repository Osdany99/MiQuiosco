import { eq, and, desc } from 'drizzle-orm'
import { db } from '../../database/client'
import { lotes, movimientosInventario } from '../../database/schema'

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
    .select({
      loteId: movimientosInventario.loteId,
      deltaAlmacen: movimientosInventario.deltaAlmacen,
      deltaQuiosco: movimientosInventario.deltaQuiosco
    })
    .from(movimientosInventario)
    .where(
      and(
        eq(movimientosInventario.puestoId, auth.usuario.puestoId),
        eq(movimientosInventario.anulado, false)
      )
    )

  const porLote = new Map<string, { almacen: number, quiosco: number, consumido: boolean }>()
  for (const m of movs) {
    if (!m.loteId) continue
    let s = porLote.get(m.loteId)
    if (!s) {
      s = { almacen: 0, quiosco: 0, consumido: false }
      porLote.set(m.loteId, s)
    }
    s.almacen += m.deltaAlmacen ?? 0
    s.quiosco += m.deltaQuiosco ?? 0
    if ((m.deltaAlmacen ?? 0) < 0 || (m.deltaQuiosco ?? 0) < 0) s.consumido = true
  }

  return filas.map(l => ({
    ...l,
    fechaEntrada: l.fechaEntrada,
    creadoEn: l.creadoEn.toISOString(),
    actualizadoEn: l.actualizadoEn.toISOString(),
    saldoAlmacen: porLote.get(l.id)?.almacen ?? l.cantidadInicial,
    saldoQuiosco: porLote.get(l.id)?.quiosco ?? 0,
    conConsumo: porLote.get(l.id)?.consumido ?? false
  }))
})
