import { eq, sql } from 'drizzle-orm'
import { db } from '../../database/client'
import { ajustes, cuadres } from '../../database/schema'
import { requireRole } from '../../utils/auth'
import { validarTopeCuadre } from '../../utils/fiadoTope'
import { createAjusteSchema } from '#shared/schemas/createAjuste'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const body = await readBody(event)
  const parsed = createAjusteSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Datos inválidos.', data: parsed.error.flatten() })
  }

  const { cuadreId, clienteId, productoId, tipo, cantidad, monto, nota } = parsed.data
  if (cantidad <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'La cantidad debe ser mayor que cero.' })
  }

  // El ajuste consume unidades del tope por producto del cuadre.
  await validarTopeCuadre(cuadreId, [{ productoId, cantidad }], { concepto: tipo === 'regalo' ? 'regalo' : 'descuento' })

  const result = await db.transaction(async (tx) => {
    const [ajuste] = await tx
      .insert(ajustes)
      .values({
        puestoId: auth.usuario.puestoId,
        cuadreId,
        clienteId,
        productoId,
        tipo,
        cantidad,
        monto,
        nota
      })
      .returning()
    const a = ajuste!

    // Suma al acumulado correspondiente del cuadre (regalo/descuento) para el
    // cálculo de total esperado y reportes.
    await tx
      .update(cuadres)
      .set(
        tipo === 'regalo'
          ? { montoRegalo: sql`${cuadres.montoRegalo} + ${monto}` }
          : { montoDescuento: sql`${cuadres.montoDescuento} + ${monto}` }
      )
      .where(eq(cuadres.id, cuadreId))

    return a
  })

  const r = result!
  return {
    id: r.id,
    cuadreId: r.cuadreId,
    clienteId: r.clienteId,
    productoId: r.productoId,
    tipo: r.tipo,
    cantidad: r.cantidad,
    monto: r.monto,
    nota: r.nota,
    creadoEn: r.creadoEn.toISOString(),
    actualizadoEn: r.actualizadoEn.toISOString()
  }
})
