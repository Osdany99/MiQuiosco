import { eq, sql } from 'drizzle-orm'
import { db } from '../../database/client'
import { cuentasFiado, pagosFiado, cuadres } from '../../database/schema'
import { requireRole } from '../../utils/auth'
import { pagoFiadoSchema } from '#shared/schemas/pagoFiado'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const body = await readBody(event)
  const parsed = pagoFiadoSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Datos inválidos.', data: parsed.error.flatten() })
  }

  const { cuentaFiadoId, cuadreId, monto, formaPago } = parsed.data

  const [cuenta] = await db
    .select()
    .from(cuentasFiado)
    .where(eq(cuentasFiado.id, cuentaFiadoId))
    .limit(1)

  if (!cuenta) {
    throw createError({ statusCode: 404, statusMessage: 'Cuenta de fiado no encontrada.' })
  }

  // Primero el estado: cobrar una cuenta saldada es conflicto (409) sin importar
  // el monto. (Antes el chequeo de saldo iba primero y cualquier cobro a una
  // pagada caia en 400 'excede el saldo', ocultando el verdadero problema.)
  if (cuenta.estado === 'pagada') {
    throw createError({ statusCode: 409, statusMessage: 'Esta deuda ya está saldada.' })
  }

  const saldoPendiente = cuenta.montoTotal - cuenta.montoPagado
  if (monto > saldoPendiente) {
    throw createError({ statusCode: 400, statusMessage: `El monto excede el saldo pendiente (${saldoPendiente}).` })
  }

  // El cuadre receptor, si lo hay, debe existir y ser del mismo puesto.
  if (cuadreId) {
    const [destino] = await db
      .select({ id: cuadres.id, puestoId: cuadres.puestoId })
      .from(cuadres)
      .where(eq(cuadres.id, cuadreId))
      .limit(1)
    if (!destino || destino.puestoId !== auth.usuario.puestoId) {
      throw createError({ statusCode: 404, statusMessage: 'Cuadre no encontrado.' })
    }
  }

  const result = await db.transaction(async (tx) => {
    const [pago] = await tx
      .insert(pagosFiado)
      .values({ cuentaFiadoId, cuadreId, monto, formaPago })
      .returning()
    const p = pago!

    const nuevoPagado = cuenta.montoPagado + monto
    await tx
      .update(cuentasFiado)
      .set({
        montoPagado: nuevoPagado,
        estado: nuevoPagado >= cuenta.montoTotal ? 'pagada' : 'parcial',
        actualizadoEn: new Date()
      })
      .where(eq(cuentasFiado.id, cuentaFiadoId))

    // Cobro directo: el efectivo no entró a ninguna gaveta, así que ningún
    // cuadre suma montoCobradoFiado.
    if (cuadreId) {
      await tx
        .update(cuadres)
        .set({ montoCobradoFiado: sql`${cuadres.montoCobradoFiado} + ${monto}` })
        .where(eq(cuadres.id, cuadreId))
    }

    // La deuda pendiente baja en el cuadre de ORIGEN (no necesariamente el
    // mismo donde se cobra: puede ser una deuda vieja). Piso 0 por cuadres
    // creados antes de este ajuste, cuyo montoFiado quedó en 0.
    // Las deudas directas no tienen cuadre de origen: solo bajan su propio
    // montoPagado, que ya se escribió arriba.
    if (cuenta.cuadreOrigenId) {
      await tx
        .update(cuadres)
        .set({ montoFiado: sql`GREATEST(${cuadres.montoFiado} - ${monto}, 0)` })
        .where(eq(cuadres.id, cuenta.cuadreOrigenId))
    }

    return p
  })

  const r = result!
  return {
    id: r.id,
    cuentaFiadoId: r.cuentaFiadoId,
    cuadreId: r.cuadreId,
    monto: r.monto,
    formaPago: r.formaPago,
    creadoEn: r.creadoEn.toISOString()
  }
})
