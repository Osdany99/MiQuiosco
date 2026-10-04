import { eq, and } from 'drizzle-orm'
import { db } from '../../database/client'
import { lotes, movimientosInventario, traspasos } from '../../database/schema'
import { traspasoSchema } from '#shared/schemas/traspaso'
import { construirTraspaso, lotesConSaldo } from '#shared/inventario/operaciones'
import { comoMovimiento } from '../../utils/inventario'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const body = await readBody(event)
  const parsed = traspasoSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Datos inválidos.', data: parsed.error.flatten() })
  }
  const datos = parsed.data
  const puestoId = auth.usuario.puestoId
  const usuarioId = auth.usuario.id
  const ahoraMs = Date.now()

  const ids = [...new Set(datos.lineas.map(l => l.productoId))]
  const filasLotes = await db
    .select()
    .from(lotes)
    .where(and(eq(lotes.puestoId, puestoId), eq(lotes.anulado, false)))
  const movs = await db
    .select()
    .from(movimientosInventario)
    .where(and(eq(movimientosInventario.puestoId, puestoId), eq(movimientosInventario.anulado, false)))

  const lotesPorProducto = new Map(
    ids.map(pid => [pid, lotesConSaldo(filasLotes, movs, pid, 'almacen')])
  )

  const { traspaso, movimientos, faltantes } = construirTraspaso({
    lineas: datos.lineas,
    lotesPorProducto,
    meta: { puestoId, usuarioId, ahora: ahoraMs, fecha: datos.fecha, notas: datos.notas }
  })

  if (faltantes.length > 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Stock insuficiente en el almacén para uno o más productos.',
      data: { faltantes }
    })
  }

  await db.transaction(async (tx) => {
    await tx.insert(traspasos).values({
      id: traspaso.id,
      puestoId,
      fecha: datos.fecha,
      notas: traspaso.notas,
      usuarioId
    })
    for (const m of movimientos) {
      await tx.insert(movimientosInventario).values(comoMovimiento(m))
    }
  })

  return { traspasoId: traspaso.id, movimientos: movimientos.length }
})
