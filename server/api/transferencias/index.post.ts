import { eq, sql } from 'drizzle-orm'
import { db } from '../../database/client'
import { transferencias, transferenciaItems, cuadres } from '../../database/schema'
import { requireRole } from '../../utils/auth'
import { validarTopeCuadre } from '../../utils/fiadoTope'
import { createTransferenciaSchema } from '#shared/schemas/createTransferencia'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const body = await readBody(event)
  const parsed = createTransferenciaSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Datos inválidos.', data: parsed.error.flatten() })
  }

  const { clienteId, cuadreId, items } = parsed.data
  const montoTotal = items.reduce((s, it) => s + it.cantidad * it.precioVentaUsado, 0)
  if (montoTotal <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'El monto de la transferencia debe ser mayor que cero.' })
  }

  await validarTopeCuadre(cuadreId, items, { concepto: 'transferencia' })

  const result = await db.transaction(async (tx) => {
    const [transferencia] = await tx
      .insert(transferencias)
      .values({
        puestoId: auth.usuario.puestoId,
        clienteId,
        cuadreId,
        montoTotal
      })
      .returning()
    const t = transferencia!

    for (const it of items) {
      await tx.insert(transferenciaItems).values({
        transferenciaId: t.id,
        productoId: it.productoId,
        cantidad: it.cantidad,
        precioVentaUsado: it.precioVentaUsado,
        subtotal: it.cantidad * it.precioVentaUsado
      })
    }

    // La transferencia cobra al instante: suma a montoTransferencia del cuadre.
    await tx
      .update(cuadres)
      .set({ montoTransferencia: sql`${cuadres.montoTransferencia} + ${montoTotal}` })
      .where(eq(cuadres.id, cuadreId))

    return t
  })

  const r = result!
  return {
    id: r.id,
    clienteId: r.clienteId,
    cuadreId: r.cuadreId,
    montoTotal: r.montoTotal,
    creadoEn: r.creadoEn.toISOString(),
    actualizadoEn: r.actualizadoEn.toISOString()
  }
})
