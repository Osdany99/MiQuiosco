import { eq, sql } from 'drizzle-orm'
import { db } from '../../database/client'
import { transferencias, cuadres } from '../../database/schema'
import { requireRole } from '../../utils/auth'
import { createTransferenciaSchema } from '#shared/schemas/createTransferencia'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const body = await readBody(event)
  const parsed = createTransferenciaSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Datos inválidos.', data: parsed.error.flatten() })
  }

  // Monto directo (sin productos): "el cliente X transfirió N pesos". Sin
  // tope por producto: no hay unidades contra qué validar.
  const { clienteId, cuadreId, monto } = parsed.data
  const montoTotal = Math.round(monto * 100) / 100

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
