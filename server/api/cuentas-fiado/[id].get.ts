import { eq } from 'drizzle-orm'
import { db } from '../../database/client'
import { cuentasFiado, cuentasFiadoItems, pagosFiado, clientes, productos } from '../../database/schema'
import { requireRole } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireRole(event, 'jefe')
  const id = event.context.params?.id
  if (!id) throw createError({ statusCode: 400, statusMessage: 'ID requerido.' })

  const [cuenta] = await db
    .select({
      id: cuentasFiado.id,
      clienteId: cuentasFiado.clienteId,
      nombreCliente: clientes.nombre,
      cuadreOrigenId: cuentasFiado.cuadreOrigenId,
      montoTotal: cuentasFiado.montoTotal,
      montoPagado: cuentasFiado.montoPagado,
      estado: cuentasFiado.estado,
      creadoEn: cuentasFiado.creadoEn,
      actualizadoEn: cuentasFiado.actualizadoEn
    })
    .from(cuentasFiado)
    .innerJoin(clientes, eq(cuentasFiado.clienteId, clientes.id))
    .where(eq(cuentasFiado.id, id))
    .limit(1)

  if (!cuenta) {
    throw createError({ statusCode: 404, statusMessage: 'Cuenta no encontrada.' })
  }

  const items = await db
    .select({
      id: cuentasFiadoItems.id,
      productoId: cuentasFiadoItems.productoId,
      nombreProducto: productos.nombre,
      cantidad: cuentasFiadoItems.cantidad,
      precioVentaUsado: cuentasFiadoItems.precioVentaUsado,
      subtotal: cuentasFiadoItems.subtotal
    })
    .from(cuentasFiadoItems)
    .innerJoin(productos, eq(cuentasFiadoItems.productoId, productos.id))
    .where(eq(cuentasFiadoItems.cuentaFiadoId, id))

  const pagos = await db
    .select()
    .from(pagosFiado)
    .where(eq(pagosFiado.cuentaFiadoId, id))
    .orderBy(pagosFiado.creadoEn)

  return {
    id: cuenta.id,
    clienteId: cuenta.clienteId,
    nombreCliente: cuenta.nombreCliente,
    cuadreOrigenId: cuenta.cuadreOrigenId,
    montoTotal: cuenta.montoTotal,
    montoPagado: cuenta.montoPagado,
    saldoPendiente: cuenta.montoTotal - cuenta.montoPagado,
    estado: cuenta.estado,
    creadoEn: cuenta.creadoEn.toISOString(),
    actualizadoEn: cuenta.actualizadoEn.toISOString(),
    items: items.map(i => ({
      id: i.id,
      productoId: i.productoId,
      nombreProducto: i.nombreProducto,
      cantidad: i.cantidad,
      precioVentaUsado: i.precioVentaUsado,
      subtotal: i.subtotal
    })),
    pagos: pagos.map(p => ({
      id: p.id,
      monto: p.monto,
      formaPago: p.formaPago,
      creadoEn: p.creadoEn.toISOString()
    }))
  }
})
