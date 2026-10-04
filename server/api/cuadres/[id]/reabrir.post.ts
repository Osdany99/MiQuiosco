import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { db } from '../../../database/client'
import { cuadres, movimientosInventario } from '../../../database/schema'
import { construirAnulacionCuadre } from '#shared/inventario/operaciones'
import { comoMovimiento } from '../../../utils/inventario'

const reabrirSchema = z.object({
  pagoTrabajador: z.number().min(0).nullable().optional()
})

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const id = event.context.params!.id as string
  const body = await readBody(event).catch(() => ({}))
  const parsed = reabrirSchema.safeParse(body ?? {})
  const pagoTrabajador = parsed.success ? (parsed.data.pagoTrabajador ?? null) : null
  const usuarioId = auth.usuario.id
  const ahora = new Date()
  const ahoraMs = ahora.getTime()

  const [cuadre] = await db.select().from(cuadres).where(eq(cuadres.id, id)).limit(1)
  if (!cuadre || cuadre.puestoId !== auth.usuario.puestoId) {
    throw createError({ statusCode: 404, statusMessage: 'Cuadre no encontrado.' })
  }
  if (cuadre.estado !== 'cerrado') {
    throw createError({ statusCode: 409, statusMessage: 'El cuadre no está cerrado.' })
  }

  await db.transaction(async (tx) => {
    const previos = await tx
      .select()
      .from(movimientosInventario)
      .where(
        and(eq(movimientosInventario.cuadreId, id), eq(movimientosInventario.anulado, false))
      )
    const { anulaciones } = construirAnulacionCuadre({
      movimientosPrevios: previos.map(p => ({
        id: p.id,
        puestoId: p.puestoId,
        productoId: p.productoId,
        loteId: p.loteId,
        cuadreId: p.cuadreId,
        lineaCuadreId: p.lineaCuadreId,
        tipo: p.tipo as 'venta',
        cantidad: p.cantidad,
        deltaAlmacen: p.deltaAlmacen ?? 0,
        deltaQuiosco: p.deltaQuiosco ?? 0,
        precioUnitario: Number(p.precioUnitario) || 0,
        importe: Number(p.importe) || 0,
        anulado: p.anulado ?? false
      })),
      meta: { puestoId: cuadre.puestoId, usuarioId, ahora: ahoraMs }
    })

    for (const a of anulaciones) {
      await tx.insert(movimientosInventario).values(comoMovimiento(a))
    }

    await tx.update(cuadres).set({
      estado: 'abierto',
      reabiertoVeces: (cuadre.reabiertoVeces ?? 0) + 1,
      ultimaReaperturaEn: ahora,
      totalRealCaja: null,
      costoTotal: null,
      ganancia: null,
      diferencia: null,
      pagoTrabajador
    }).where(eq(cuadres.id, id))
  })

  return { success: true }
})
