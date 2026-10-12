import { eq, sql } from 'drizzle-orm'
import { db } from '../../database/client'
import { cuentasFiado, cuentasFiadoItems, pagosFiado, cuadres } from '../../database/schema'
import { requireRole } from '../../utils/auth'
import { validarTopeFiado } from '../../utils/fiadoTope'
import { createCuentaFiadoSchema } from '#shared/schemas/createCuentaFiado'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const body = await readBody(event)
  const parsed = createCuentaFiadoSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Datos inválidos.', data: parsed.error.flatten() })
  }

  const { clienteId, cuadreOrigenId, items, montoPagadoInicial = 0, formaPagoInicial = 'efectivo' } = parsed.data
  const montoTotal = items.reduce((s, it) => s + it.cantidad * it.precioVentaUsado, 0)

  if (montoPagadoInicial > montoTotal) {
    throw createError({ statusCode: 400, statusMessage: 'El pago inicial no puede superar el monto total.' })
  }

  await validarTopeFiado(cuadreOrigenId, items)

  const result = await db.transaction(async (tx) => {
    const [cuenta] = await tx
      .insert(cuentasFiado)
      .values({
        puestoId: auth.usuario.puestoId,
        clienteId,
        cuadreOrigenId,
        montoTotal,
        montoPagado: montoPagadoInicial,
        estado: !montoPagadoInicial ? 'pendiente' : montoPagadoInicial >= montoTotal ? 'pagada' : 'parcial'
      })
      .returning()
    const c = cuenta!

    for (const it of items) {
      await tx.insert(cuentasFiadoItems).values({
        cuentaFiadoId: c.id,
        productoId: it.productoId,
        cantidad: it.cantidad,
        precioVentaUsado: it.precioVentaUsado,
        subtotal: it.cantidad * it.precioVentaUsado
      })
    }

    if (montoPagadoInicial > 0) {
      // El abono en el momento NO va a montoCobradoFiado: ese acumulado cuenta
      // los cobros que entraron por una gaveta y el abono ya se descuenta por la
      // vía normal (fiado neto + esta gaveta), así que sumarlo lo contaría doble.
      //
      // El cuadreId del pago es lo que hace después que el borrado de la deuda
      // sepa a qué gaveta devolver el dinero:
      //   - transferencia → el abono entró a montoTransferencia de ESE cuadre,
      //     así que se marca con su id y borrar la deuda lo revierte.
      //   - efectivo       → el jefe lo teclea en "Dinero real en caja", que es
      //     un campo manual sin registro que revertir; queda cuadreId null.
      // Un cobro posterior SIEMPRE va con cuadreId null (es cobro directo, por
      // fuera del cuadre), así que nunca se confunde con el abono inicial.
      const abonoEnTransferencia = formaPagoInicial === 'transferencia'
      await tx.insert(pagosFiado).values({
        cuentaFiadoId: c.id,
        cuadreId: abonoEnTransferencia ? cuadreOrigenId : null,
        monto: montoPagadoInicial,
        formaPago: formaPagoInicial
      })

      if (abonoEnTransferencia) {
        // El abono entra a la gaveta de transferencias del cuadre del día. No se
        // crea fila en `transferencias`: esa tabla registra lo que el jefe
        // captura a mano, y una fila aquí no tendría forma de distinguirse de
        // esa al borrar la deuda (no hay FK que las una).
        await tx
          .update(cuadres)
          .set({
            montoTransferencia: sql`${cuadres.montoTransferencia} + ${montoPagadoInicial}`
          })
          .where(eq(cuadres.id, cuadreOrigenId))
      }
    }

    // Fiado neto generado hoy (total menos pago inicial): mantiene al día el
    // campo del cuadre para el desglose de cierre y el cálculo de faltante.
    const netoGenerado = montoTotal - montoPagadoInicial
    if (netoGenerado !== 0) {
      await tx
        .update(cuadres)
        .set({ montoFiado: sql`${cuadres.montoFiado} + ${netoGenerado}` })
        .where(eq(cuadres.id, cuadreOrigenId))
    }

    return c
  })

  const r = result!
  return {
    id: r.id,
    clienteId: r.clienteId,
    cuadreOrigenId: r.cuadreOrigenId,
    montoTotal: r.montoTotal,
    montoPagado: r.montoPagado,
    estado: r.estado,
    creadoEn: r.creadoEn.toISOString(),
    actualizadoEn: r.actualizadoEn.toISOString()
  }
})
