import { eq, sql } from 'drizzle-orm'
import { db } from '../../database/client'
import { cuentasFiado, cuentasFiadoItems, pagosFiado, cuadres } from '../../database/schema'
import { requirePermiso } from '../../utils/permisos'
import { validarTopeFiado } from '../../utils/fiadoTope'
import { existentePorId } from '../../utils/idempotencia'
import { createCuentaFiadoSchema } from '#shared/schemas/createCuentaFiado'
import { conflictoIdempotente, cuentaFiadoCoincide } from '#shared/fiadoIdempotencia'

export default defineEventHandler(async (event) => {
  const auth = await requirePermiso(event, {
    jefe: 'vistas.deudas',
    trabajador: 'acciones.cuadre.fiar'
  })
  const body = await readBody(event)
  const parsed = createCuentaFiadoSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Datos inválidos.', data: parsed.error.flatten() })
  }

  const { clienteId, cuadreOrigenId, items, montoPagadoInicial = 0, formaPagoInicial = 'efectivo' } = parsed.data
  // Sin productos es una deuda de dinero: el total viene del campo directo.
  // Reducir un array vacío la convertía silenciosamente en una deuda de cero.
  const montoTotal = items.length > 0
    ? items.reduce((s, it) => s + it.cantidad * it.precioVentaUsado, 0)
    : Number(parsed.data.montoTotal ?? 0)

  // Reintento de la misma deuda: no se vuelve a sumar al cuadre.
  const previa = await existentePorId(cuentasFiado, parsed.data.id, auth.usuario.puestoId)
  if (previa) {
    if (!cuentaFiadoCoincide(previa, { clienteId, cuadreOrigenId, montoTotal })) {
      throw conflictoIdempotente('deuda')
    }
    return {
      id: previa.id,
      clienteId: previa.clienteId,
      cuadreOrigenId: previa.cuadreOrigenId,
      montoTotal: previa.montoTotal,
      montoPagado: previa.montoPagado,
      estado: previa.estado,
      creadoEn: new Date(String(previa.creadoEn)).toISOString(),
      actualizadoEn: new Date(String(previa.actualizadoEn)).toISOString(),
      idempotente: true
    }
  }

  if (auth.usuario.rol === 'trabajador' && montoPagadoInicial > 0) {
    throw createError({ statusCode: 403, statusMessage: 'El trabajador no puede registrar cobros.' })
  }

  const [origen] = await db
    .select({ id: cuadres.id, estado: cuadres.estado, puestoId: cuadres.puestoId })
    .from(cuadres)
    .where(eq(cuadres.id, cuadreOrigenId))
    .limit(1)
  if (!origen || origen.puestoId !== auth.usuario.puestoId) {
    throw createError({ statusCode: 404, statusMessage: 'Cuadre no encontrado.' })
  }
  if (origen.estado !== 'abierto') {
    throw createError({ statusCode: 409, statusMessage: 'El cuadre está cerrado.' })
  }

  if (montoPagadoInicial > montoTotal) {
    throw createError({ statusCode: 400, statusMessage: 'El pago inicial no puede superar el monto total.' })
  }

  if ((items ?? []).length > 0) await validarTopeFiado(cuadreOrigenId, items)

  const result = await db.transaction(async (tx) => {
    const [cuenta] = await tx
      .insert(cuentasFiado)
      .values({
        ...(parsed.data.id ? { id: parsed.data.id } : {}),
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
