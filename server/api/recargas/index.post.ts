import { eq } from 'drizzle-orm'
import { db } from '../../database/client'
import { clientes, recargas } from '../../database/schema'
import { requireRole } from '../../utils/auth'
import { createRecargaSchema } from '#shared/schemas/recarga'

/**
 * Alta de recarga. En el flujo normal la llama la bandeja de /recargas/sms al
 * confirmar una pendiente, pero también sirve para registrar a mano una recarga
 * cuyo SMS no llegó (p.ej. se borró del buzón).
 */
export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const body = await readBody(event)
  const parsed = createRecargaSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Datos inválidos.', data: parsed.error.flatten() })
  }

  const datos = parsed.data

  // Toda recarga del historial tiene dueño: sin cliente no hay a quién
  // imputar la deuda, y una recarga pagada en mostrador también es de alguien.
  if (!datos.clienteId) {
    throw createError({ statusCode: 400, statusMessage: 'La recarga necesita un cliente.' })
  }
  const [cliente] = await db
    .select({ id: clientes.id, puestoId: clientes.puestoId })
    .from(clientes)
    .where(eq(clientes.id, datos.clienteId))
  if (!cliente || cliente.puestoId !== auth.usuario.puestoId) {
    throw createError({ statusCode: 404, statusMessage: 'Cliente no encontrado.' })
  }

  // Idempotencia: el mismo SMS puede llegar por dos vías (cola en vivo y
  // barrido del buzón) o reprocesarse. El ID de transacción lo evita.
  if (datos.idTransaccion) {
    const [existe] = await db
      .select({ id: recargas.id })
      .from(recargas)
      .where(eq(recargas.idTransaccion, datos.idTransaccion))
    if (existe) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Esta recarga ya está en el historial.',
        data: { id: existe.id }
      })
    }
  }

  const [r] = await db
    .insert(recargas)
    .values({
      puestoId: auth.usuario.puestoId,
      clienteId: datos.clienteId,
      telefonoDestino: datos.telefonoDestino,
      telefonoRaw: datos.telefonoRaw ?? null,
      plataforma: datos.plataforma,
      tipo: datos.tipo,
      descripcion: datos.descripcion ?? null,
      unidades: datos.unidades ?? null,
      montoNominal: datos.montoNominal,
      costo: datos.costo,
      ganancia: datos.ganancia,
      idTransaccion: datos.idTransaccion ?? null,
      saldoCarteraCup: datos.saldoCarteraCup ?? null,
      saldoCarteraUsd: datos.saldoCarteraUsd ?? null,
      estadoPago: datos.estadoPago,
      montoCobrado: datos.estadoPago === 'pagada' ? datos.montoNominal : datos.montoCobrado,
      smsId: datos.smsId ?? null
    })
    .returning()

  const c = r!
  return {
    id: c.id,
    puestoId: c.puestoId,
    clienteId: c.clienteId,
    telefonoDestino: c.telefonoDestino,
    plataforma: c.plataforma,
    tipo: c.tipo,
    montoNominal: c.montoNominal,
    costo: c.costo,
    ganancia: c.ganancia,
    idTransaccion: c.idTransaccion,
    estadoPago: c.estadoPago,
    montoCobrado: c.montoCobrado,
    creadoEn: c.creadoEn.toISOString(),
    actualizadoEn: c.actualizadoEn.toISOString()
  }
})
