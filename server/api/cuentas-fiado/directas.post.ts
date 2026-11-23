import { eq, and, inArray, sql } from 'drizzle-orm'
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
import { exigirPermiso, filtrarCostosTrabajador, requirePermiso } from '../../utils/permisos'
import { deudaDirectaPrevia } from '../../utils/directasIdempotencia'
import { deudaDirectaSchema } from '#shared/schemas/directas'
import { construirVentaDirecta, generarId, lotesConSaldo } from '#shared/inventario/operaciones'
import { comoMovimiento, comoVentaDirecta, conGuardaStock } from '../../utils/inventario'

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
  const auth = await requirePermiso(event, {
    jefe: 'vistas.deudas',
    trabajador: 'acciones.cuadre.fiar'
  })
  const body = await readBody(event)
  const parsed = deudaDirectaSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Datos inválidos.', data: parsed.error.flatten() })
  }
  const datos = parsed.data
  if (auth.usuario.rol === 'trabajador' && Number(datos.montoPagadoInicial) > 0) {
    throw createError({ statusCode: 403, statusMessage: 'El trabajador no puede registrar cobros.' })
  }
  if (auth.usuario.rol === 'trabajador') {
    await exigirPermiso(auth, `acciones.${datos.ubicacion}.voz`)
  }
  const puestoId = auth.usuario.puestoId
  const usuarioId = auth.usuario.id
  const ahora = new Date()
  const ahoraMs = ahora.getTime()

  // Reintento de la misma deuda: debe coincidir el efecto completo, no solo el total.
  const previa = await deudaDirectaPrevia(db, datos.id, datos, puestoId)
  if (previa) {
    return filtrarCostosTrabajador(auth, {
      id: previa.id,
      clienteId: previa.clienteId,
      ubicacion: datos.ubicacion,
      directa: true,
      montoTotal: previa.montoTotal,
      costoTotal: previa.costoTotal,
      ganancia: previa.ganancia,
      lineas: datos.lineas.length,
      movimientos: 0,
      idempotente: true
    })
  }

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
  const resultado = await conGuardaStock(() => db.transaction(async (tx) => {
    const cuentaId = datos.id ?? generarId()
    await tx.execute(sql`SELECT pg_advisory_xact_lock(20405, hashtext(${cuentaId}))`)
    const enTx = await deudaDirectaPrevia(tx, cuentaId, datos, puestoId)
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
      motivo: datos.ubicacion === 'almacen' ? 'deuda_directa_almacen' : 'deuda_directa_quiosco',
      meta: { puestoId, usuarioId, ahora: ahoraMs }
    }))

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

    if (datos.montoPagadoInicial > venta.montoTotal) {
      throw createError({ statusCode: 400, statusMessage: 'El pago inicial no puede superar el monto total.' })
    }

    const [cuenta] = await tx
      .insert(cuentasFiado)
      .values({
        id: cuentaId,
        puestoId,
        clienteId: datos.clienteId,
        cuadreOrigenId: null,
        montoTotal: venta.montoTotal,
        montoPagado: datos.montoPagadoInicial ?? 0,
        costoTotal: venta.costoTotal,
        ganancia: venta.ganancia,
        estado: !datos.montoPagadoInicial
          ? 'pendiente'
          : datos.montoPagadoInicial >= venta.montoTotal
            ? 'pagada'
            : 'parcial'
      })
      .onConflictDoNothing()
      .returning()
    if (!cuenta) {
      const previa = await deudaDirectaPrevia(tx, cuentaId, datos, puestoId)
      if (!previa) throw new Error('No se pudo reconciliar la deuda duplicada.')
      return { id: previa.id, previa, idempotente: true }
    }
    const c = cuenta

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
  }))

  if (!('items' in resultado)) {
    return filtrarCostosTrabajador(auth, {
      id: resultado.previa.id,
      clienteId: resultado.previa.clienteId,
      ubicacion: datos.ubicacion,
      directa: true,
      montoTotal: resultado.previa.montoTotal,
      costoTotal: resultado.previa.costoTotal,
      ganancia: resultado.previa.ganancia,
      lineas: datos.lineas.length,
      movimientos: 0,
      idempotente: true
    })
  }

  return filtrarCostosTrabajador(auth, {
    id: resultado.id,
    clienteId: datos.clienteId,
    ubicacion: datos.ubicacion,
    directa: true,
    montoTotal: resultado.montoTotal,
    costoTotal: resultado.costoTotal,
    ganancia: resultado.ganancia,
    lineas: resultado.items.length,
    movimientos: resultado.movimientos.length
  })
})
