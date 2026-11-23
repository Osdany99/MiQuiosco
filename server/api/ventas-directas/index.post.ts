import { eq, and, inArray, sql } from 'drizzle-orm'
import { db } from '../../database/client'
import {
  lotes,
  movimientosInventario,
  productos,
  clientes,
  ventasDirectas,
  ventasDirectasItems
} from '../../database/schema'
import { requireRole } from '../../utils/auth'
import { ventaDirectaPrevia } from '../../utils/directasIdempotencia'
import { ventaDirectaSchema } from '#shared/schemas/directas'
import { instanteConfiable } from '#shared/fechas'
import { construirVentaDirecta, generarId, lotesConSaldo } from '#shared/inventario/operaciones'
import { comoMovimiento, comoVentaDirecta, conGuardaStock } from '../../utils/inventario'

/**
 * Venta directa: efectivo cobrado por el jefe fuera de un cuadre (quiosco
 * cerrado, cliente que llega a la casa). No toca ninguna gaveta ni el corte del
 * día; el efectivo se queda en el bolsillo de quien cobra. El producto sí sale
 * del inventario por FIFO desde la ubicación elegida, y el costo/ganancia
 * quedan congelados en el momento de la venta.
 */
export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const body = await readBody(event)
  const parsed = ventaDirectaSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Datos inválidos.', data: parsed.error.flatten() })
  }
  const datos = parsed.data
  const puestoId = auth.usuario.puestoId
  const usuarioId = auth.usuario.id

  // Reintento de la misma venta (red cortada, doble toque, cola de sync): la
  // fila ya existe con ese id y volver a aplicarla descontaría stock dos veces.
  const previa = await ventaDirectaPrevia(db, datos.id, datos, puestoId)
  if (previa) {
    return {
      id: previa.id,
      ubicacion: previa.ubicacionVenta,
      montoTotal: previa.montoTotal,
      costoTotal: previa.costoTotal,
      ganancia: previa.ganancia,
      lineas: datos.lineas.length,
      movimientos: 0,
      idempotente: true
    }
  }

  // Fecha de la venta: por defecto ahora. La cola de voz manda la hora del
  // dictado (puede ser de ayer) para que la venta quede en su día. El reloj del
  // aparato puede ir adelantado (Cuba no cambió la hora y los teléfonos sí): se
  // recorta al instante del servidor para que nada quede fechado en el futuro.
  const ahoraMsServidor = Date.now()
  const MS_MAXIMO_ANTIGUO = 8 * 24 * 60 * 60 * 1000
  const { ms: fechaVentaMs, ajustado, fueraDeTolerancia } = instanteConfiable(datos.creadoEn, ahoraMsServidor)
  if (fueraDeTolerancia) {
    throw createError({
      statusCode: 400,
      statusMessage: 'La fecha de la venta está muy por delante de la hora del servidor: revisa la hora del equipo.'
    })
  }
  if (ajustado) {
    // Queda constancia: si un equipo va adelantado, se ve en los logs.
    console.warn(`[ventas-directas] reloj del equipo adelantado: ${datos.creadoEn} → ${fechaVentaMs}`)
  }
  if (ahoraMsServidor - fechaVentaMs > MS_MAXIMO_ANTIGUO) {
    throw createError({ statusCode: 400, statusMessage: 'La fecha de la venta es demasiado antigua.' })
  }
  const fechaVenta = new Date(fechaVentaMs)
  const ahoraMs = fechaVentaMs

  const ids = [...new Set(datos.lineas.map(l => l.productoId))]
  const prods = await db.select().from(productos).where(inArray(productos.id, ids))
  const porId = new Map(prods.map(p => [p.id, p]))
  for (const id of ids) {
    const p = porId.get(id)
    if (!p || p.puestoId !== puestoId) {
      throw createError({ statusCode: 400, statusMessage: 'Hay productos que no pertenecen a este puesto.' })
    }
  }

  // El cliente es opcional en las ventas (solo la deuda directa lo exige), pero
  // si viene debe ser del puesto y estar activo: mismo criterio que la deuda.
  if (datos.clienteId) {
    const [cliente] = await db
      .select()
      .from(clientes)
      .where(eq(clientes.id, datos.clienteId))
      .limit(1)
    if (!cliente || cliente.puestoId !== puestoId || !cliente.activo) {
      throw createError({ statusCode: 400, statusMessage: 'Cliente inválido.' })
    }
  }

  const resultado = await conGuardaStock(() => db.transaction(async (tx) => {
    const ventaId = datos.id ?? generarId()
    // El mismo ID se serializa antes de leer stock: si otro reintento gana,
    // este espera y devuelve su recibo en vez de fallar por un FIFO ya obsoleto.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(20405, hashtext(${ventaId}))`)
    const enTx = await ventaDirectaPrevia(tx, ventaId, datos, puestoId)
    if (enTx) return { id: enTx.id, previa: enTx, idempotente: true }

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
      tipoVenta: datos.tipoVenta,
      ventaId,
      meta: { puestoId, usuarioId, ahora: ahoraMs }
    }))

    // Si la ubicación elegida no alcanza, se avisa antes de escribir nada: es
    // preferible a dejar una venta registrada que no se pudo servir.
    if (venta.faltantes.length > 0) {
      const nombres = venta.faltantes
        .map(f => porId.get(f.productoId)?.nombre ?? f.productoId)
        .join(', ')
      const detalle = venta.faltantes.map(f => `${f.faltante}`).join(', ')
      throw createError({
        statusCode: 409,
        statusMessage: `No hay stock suficiente en ${datos.ubicacion} para: ${nombres} (faltan ${detalle}).`,
        data: { codigo: 'stock_insuficiente' }
      })
    }

    const [ventaRow] = await tx
      .insert(ventasDirectas)
      .values({
        id: ventaId,
        puestoId,
        ubicacionVenta: datos.ubicacion,
        tipoVenta: datos.tipoVenta,
        clienteId: datos.clienteId ?? null,
        montoTotal: venta.montoTotal,
        costoTotal: venta.costoTotal,
        ganancia: venta.ganancia,
        notas: datos.notas ?? null,
        usuarioId,
        anulado: false,
        creadoEn: fechaVenta
      })
      .onConflictDoNothing()
      .returning()
    if (!ventaRow) {
      // Dos reintentos con el mismo ID pueden pasar el precheck a la vez. El
      // ganador ya escribió; este espera el índice único y devuelve ese recibo.
      const previa = await ventaDirectaPrevia(tx, ventaId, datos, puestoId)
      if (!previa) throw new Error('No se pudo reconciliar la venta duplicada.')
      return { id: previa.id, previa, idempotente: true }
    }
    const vd = ventaRow

    for (const it of venta.items) {
      await tx.insert(ventasDirectasItems).values({
        id: it.id,
        ventaDirectaId: vd.id,
        productoId: it.productoId,
        cantidad: it.cantidad,
        precioVentaUsado: it.precioVentaUsado,
        subtotal: it.subtotal,
        costoUnitario: it.costoUnitario,
        costoTotal: it.costoTotal,
        secuencia: it.secuencia
      })
    }
    for (const m of venta.movimientos) {
      await tx.insert(movimientosInventario).values(comoMovimiento(m))
    }

    return { id: vd.id, ...venta }
  }))

  if (!('items' in resultado)) {
    return {
      id: resultado.previa.id,
      ubicacion: resultado.previa.ubicacionVenta,
      montoTotal: resultado.previa.montoTotal,
      costoTotal: resultado.previa.costoTotal,
      ganancia: resultado.previa.ganancia,
      lineas: datos.lineas.length,
      movimientos: 0,
      idempotente: true
    }
  }

  return {
    id: resultado.id,
    ubicacion: datos.ubicacion,
    montoTotal: resultado.montoTotal,
    costoTotal: resultado.costoTotal,
    ganancia: resultado.ganancia,
    lineas: resultado.items.length,
    movimientos: resultado.movimientos.length
  }
})
