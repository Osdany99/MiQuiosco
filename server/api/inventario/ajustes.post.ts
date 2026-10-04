import { eq, and } from 'drizzle-orm'
import { db } from '../../database/client'
import { lotes, movimientosInventario } from '../../database/schema'
import { ajusteInventarioSchema } from '#shared/schemas/traspaso'
import { construirAjuste, lotesConSaldo } from '#shared/inventario/operaciones'
import { comoMovimiento } from '../../utils/inventario'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const body = await readBody(event)
  const parsed = ajusteInventarioSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Datos inválidos.', data: parsed.error.flatten() })
  }
  const datos = parsed.data
  const puestoId = auth.usuario.puestoId
  const usuarioId = auth.usuario.id
  const ahoraMs = Date.now()

  const [prod] = await db
    .select({ id: lotes.productoId })
    .from(lotes)
    .where(eq(lotes.productoId, datos.productoId))
    .limit(1)
  if (!prod) {
    throw createError({ statusCode: 400, statusMessage: 'El producto no tiene lotes registrados.' })
  }

  const filasLotes = await db
    .select()
    .from(lotes)
    .where(and(eq(lotes.puestoId, puestoId), eq(lotes.anulado, false)))
  const movs = await db
    .select()
    .from(movimientosInventario)
    .where(and(eq(movimientosInventario.puestoId, puestoId), eq(movimientosInventario.anulado, false)))

  // La devolución siempre sale del quiosco (vuelve al almacén).
  const ubicacion = datos.tipo === 'devolucion' ? 'quiosco' : datos.ubicacion
  const disponibles = lotesConSaldo(filasLotes, movs, datos.productoId, ubicacion)

  const { movimientos, faltante } = construirAjuste({
    productoId: datos.productoId,
    tipo: datos.tipo,
    ubicacion,
    cantidad: datos.cantidad,
    motivo: datos.motivo,
    nota: datos.nota ?? null,
    lotesOrdenados: disponibles,
    meta: { puestoId, usuarioId, ahora: ahoraMs }
  })

  if (faltante) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Stock insuficiente para este ajuste.',
      data: { faltante }
    })
  }

  await db.transaction(async (tx) => {
    for (const m of movimientos) {
      await tx.insert(movimientosInventario).values(comoMovimiento(m))
    }
  })

  return { movimientos: movimientos.length }
})
