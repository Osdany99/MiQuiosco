import { eq, and, inArray } from 'drizzle-orm'
import { db } from '../../database/client'
import {
  lotes,
  movimientosInventario,
  productos,
  clientes,
  cuentasFiado,
  cuentasFiadoItems,
  pagosFiado
} from '../../database/schema'
import { requireRole } from '../../utils/auth'
import { deudaDirectaSchema } from '#shared/schemas/directas'
import { construirVentaDirecta, lotesConSaldo } from '#shared/inventario/operaciones'
import { comoMovimiento, comoVentaDirecta } from '../../utils/inventario'

/**
 * Deuda directa: el jefe fía por fuera del cuadre (el quiosco está cerrado y
 * el cliente pide fiado, o simplemente no hay cuadre abierto).
 *
 * Se diferencia de la deuda del cuadre en tres cosas:
 *  - cuadreOrigenId queda NULL, así que no pasa por el tope (no hay líneas de
 *    cuadre contra las que validar) ni suma nada a ningún cuadre.
 *  - La mercancía sale igual del inventario (FIFO) desde la ubicación elegida.
 *  - Su costo y ganancia quedan congelados en la propia cuenta, igual que al
 *    cerrar un cuadre, para poder mostrarlos sin recalcular.
 */
export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const body = await readBody(event)
  const parsed = deudaDirectaSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Datos inválidos.', data: parsed.error.flatten() })
  }
  const datos = parsed.data
  const puestoId = auth.usuario.puestoId
  const usuarioId = auth.usuario.id
  const ahora = new Date()
  const ahoraMs = ahora.getTime()

  // Los clientes viven en su propia tabla desde la migracion 0018 (antes eran
  // usuarios con rol='cliente'): validar contra usuarios hacia imposible crear
  // deudas directas (siempre 400 'Cliente inválido').
  const [cliente] = await db
    .select()
    .from(clientes)
    .where(eq(clientes.id, datos.clienteId))
    .limit(1)
  if (!cliente || cliente.puestoId !== puestoId || !cliente.activo) {
    throw createError({ statusCode: 400, statusMessage: 'Cliente inválido.' })
  }

  const ids = [...new Set(datos.lineas.map(l => l.productoId))]
  const prods = await db.select().from(productos).where(inArray(productos.id, ids))
  const porId = new Map(prods.map(p => [p.id, p]))
  for (const id of ids) {
    const p = porId.get(id)
    if (!p || p.puestoId !== puestoId) {
      throw createError({ statusCode: 400, statusMessage: 'Hay productos que no pertenecen a este puesto.' })
    }
  }
  const resultado = await db.transaction(async (tx) => {
    const [filasLotes, movs] = await Promise.all([
      tx.select().from(lotes).where(and(eq(lotes.puestoId, puestoId), eq(lotes.anulado, false))),
      tx
        .select()
        .from(movimientosInventario)
        .where(
          and(eq(movimientosInventario.puestoId, puestoId), eq(movimientosInventario.anulado, false))
        )
    ])
    const lotesPorProducto = new Map(
      ids.map(pid => [pid, lotesConSaldo(filasLotes, movs, pid, datos.ubicacion)])
    )

    const venta = comoVentaDirecta(construirVentaDirecta({
      lineas: datos.lineas,
      lotesPorProducto,
      ubicacion: datos.ubicacion,
      motivo: datos.ubicacion === 'almacen' ? 'deuda_directa_almacen' : 'deuda_directa_quiosco',
      meta: { puestoId, usuarioId, ahora: ahoraMs }
    }))

    if (venta.faltantes.length > 0) {
      const nombres = venta.faltantes
        .map(f => porId.get(f.productoId)?.nombre ?? f.productoId)
        .join(', ')
      const detalle = venta.faltantes.map(f => `${f.faltante}`).join(', ')
      throw createError({
        statusCode: 400,
        statusMessage: `No hay stock suficiente en ${datos.ubicacion} para: ${nombres} (faltan ${detalle}).`
      })
    }

    if (datos.montoPagadoInicial > venta.montoTotal) {
      throw createError({ statusCode: 400, statusMessage: 'El pago inicial no puede superar el monto total.' })
    }

    const [cuenta] = await tx
      .insert(cuentasFiado)
      .values({
        puestoId,
        clienteId: datos.clienteId,
        cuadreOrigenId: null,
        montoTotal: venta.montoTotal,
        montoPagado: datos.montoPagadoInicial,
        costoTotal: venta.costoTotal,
        ganancia: venta.ganancia,
        estado: !datos.montoPagadoInicial
          ? 'pendiente'
          : datos.montoPagadoInicial >= venta.montoTotal
            ? 'pagada'
            : 'parcial'
      })
      .returning()
    const c = cuenta!

    for (const it of venta.items) {
      await tx.insert(cuentasFiadoItems).values({
        id: it.id,
        cuentaFiadoId: c.id,
        productoId: it.productoId,
        cantidad: it.cantidad,
        precioVentaUsado: it.precioVentaUsado,
        subtotal: it.subtotal
      })
    }
    for (const m of venta.movimientos) {
      await tx.insert(movimientosInventario).values(comoMovimiento(m))
    }

    // El pago inicial de una deuda directa es, por definición, dinero que el
    // jefe ya cobró: va como pago directo (cuadreId NULL) para que no infle
    // ninguna gaveta.
    if (datos.montoPagadoInicial > 0) {
      await tx.insert(pagosFiado).values({
        cuentaFiadoId: c.id,
        cuadreId: null,
        monto: datos.montoPagadoInicial,
        formaPago: datos.formaPagoInicial
      })
    }

    return { id: c.id, ...venta }
  })

  return {
    id: resultado.id,
    clienteId: datos.clienteId,
    ubicacion: datos.ubicacion,
    directa: true,
    montoTotal: resultado.montoTotal,
    costoTotal: resultado.costoTotal,
    ganancia: resultado.ganancia,
    lineas: resultado.items.length,
    movimientos: resultado.movimientos.length
  }
})
