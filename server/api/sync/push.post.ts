import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../../database/client'
import {
  productos,
  historialPrecios,
  cuadres,
  cuadreItems,
  clientes,
  cuentasFiado,
  cuentasFiadoItems,
  pagosFiado
} from '../../database/schema'
import { requireAuth } from '../../utils/auth'
import type { PushResponse, Producto, HistorialPrecio, Cuadre, CuadreItem, Cliente, CuentaFiado, CuentaFiadoItem, PagoFiado } from '../../../shared/types'

const pushSchema = z.object({
  productos: z.array(z.any()).default([]),
  historial_precios: z.array(z.any()).default([]),
  cuadres: z.array(z.any()).default([]),
  cuadre_items: z.array(z.any()).default([]),
  clientes: z.array(z.any()).default([]),
  cuentas_fiado: z.array(z.any()).default([]),
  cuentas_fiado_items: z.array(z.any()).default([]),
  pagos_fiado: z.array(z.any()).default([])
})

/**
 * POST /api/sync/push
 *
 * Recibe registros locales del jefe y aplica last-write-wins por registro:
 * - Si el registro no existe en el servidor → insertarlo.
 * - Si existe y su `actualizado_en` entrante es mayor → actualizarlo.
 * - Si existe y su `actualizado_en` del servidor es mayor → devolverlo
 *   como conflicto para que el cliente lo absorba (last-write-wins = servidor).
 *
 * Devuelve los IDs aceptados (para que el cliente los marque sincronizados)
 * y los conflictos (para que el cliente los absorba).
 */
export default defineEventHandler(async (event): Promise<PushResponse> => {
  const auth = await requireAuth(event, 'sync')

  const body = await readBody(event)
  const parsed = pushSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Payload inválido.',
      data: parsed.error.flatten()
    })
  }

  const aceptados: string[] = []
  const conflictos: PushResponse['conflictos'] = {
    productos: [],
    historial_precios: [],
    cuadres: [],
    cuadre_items: [],
    clientes: [],
    cuentas_fiado: [],
    cuentas_fiado_items: [],
    pagos_fiado: []
  }

  // Productos
  for (const p of parsed.data.productos as Producto[]) {
    const existing = await db
      .select()
      .from(productos)
      .where(eq(productos.id, p.id))
      .limit(1)

    if (existing.length === 0) {
      await db.insert(productos).values({
        id: p.id,
        puestoId: p.puestoId,
        nombre: p.nombre,
        descripcion: p.descripcion,
        activo: p.activo,
        orden: p.orden,
        precioCompraActual: String(p.precioCompraActual),
        precioVentaActual: String(p.precioVentaActual),
        creadoEn: new Date(p.creadoEn as string | number),
        actualizadoEn: new Date(p.actualizadoEn as string | number)
      })
      aceptados.push(p.id)
    } else {
      const serverTs = new Date(existing[0]!.actualizadoEn).getTime()
      const clientTs = new Date(p.actualizadoEn as string | number).getTime()

      if (clientTs > serverTs) {
        await db
          .update(productos)
          .set({
            nombre: p.nombre,
            descripcion: p.descripcion,
            activo: p.activo,
            orden: p.orden,
            precioCompraActual: String(p.precioCompraActual),
            precioVentaActual: String(p.precioVentaActual),
            actualizadoEn: new Date(p.actualizadoEn as string | number)
          })
          .where(eq(productos.id, p.id))
        aceptados.push(p.id)
      } else {
        conflictos.productos.push(serverRowToProducto(existing[0]!))
      }
    }
  }

  // Historial de precios
  for (const h of parsed.data.historial_precios as HistorialPrecio[]) {
    const existing = await db
      .select()
      .from(historialPrecios)
      .where(eq(historialPrecios.id, h.id))
      .limit(1)

    if (existing.length === 0) {
      await db.insert(historialPrecios).values({
        id: h.id,
        productoId: h.productoId,
        precioCompra: String(h.precioCompra),
        precioVenta: String(h.precioVenta),
        vigenteDesde: new Date(h.vigenteDesde as string | number),
        vigenteHasta: h.vigenteHasta ? new Date(h.vigenteHasta as string | number) : null,
        cambiadoPor: h.cambiadoPor,
        creadoEn: new Date(h.creadoEn as string | number)
      })
      aceptados.push(h.id)
    } else {
      // Historial nunca se actualiza; si el server ya lo tiene, lo aceptamos
      aceptados.push(h.id)
    }
  }

  // Cuadres
  for (const c of parsed.data.cuadres as Cuadre[]) {
    const existing = await db
      .select()
      .from(cuadres)
      .where(eq(cuadres.id, c.id))
      .limit(1)

    if (existing.length === 0) {
      await db.insert(cuadres).values({
        id: c.id,
        puestoId: c.puestoId,
        fecha: c.fecha,
        jefeId: c.jefeId,
        trabajadorTurnoId: c.trabajadorTurnoId,
        pagoTrabajador: c.pagoTrabajador != null ? String(c.pagoTrabajador) : null,
        totalEsperado: String(c.totalEsperado),
        totalRealCaja: c.totalRealCaja != null ? String(c.totalRealCaja) : null,
        montoTransferencia: String(c.montoTransferencia),
        montoFiado: String(c.montoFiado),
        diferencia: c.diferencia != null ? String(c.diferencia) : null,
        estado: c.estado,
        notas: c.notas,
        cerradoEn: c.cerradoEn ? new Date(c.cerradoEn as string | number) : null,
        reabiertoVeces: c.reabiertoVeces,
        ultimaReaperturaEn: c.ultimaReaperturaEn
          ? new Date(c.ultimaReaperturaEn as string | number)
          : null,
        creadoEn: new Date(c.creadoEn as string | number),
        actualizadoEn: new Date(c.actualizadoEn as string | number)
      })
      aceptados.push(c.id)
    } else {
      const serverTs = new Date(existing[0]!.actualizadoEn).getTime()
      const clientTs = new Date(c.actualizadoEn as string | number).getTime()

      if (clientTs > serverTs) {
        await db
          .update(cuadres)
          .set({
            trabajadorTurnoId: c.trabajadorTurnoId,
            pagoTrabajador: c.pagoTrabajador != null ? String(c.pagoTrabajador) : null,
            totalEsperado: String(c.totalEsperado),
            totalRealCaja: c.totalRealCaja != null ? String(c.totalRealCaja) : null,
            montoTransferencia: String(c.montoTransferencia),
            montoFiado: String(c.montoFiado),
            diferencia: c.diferencia != null ? String(c.diferencia) : null,
            estado: c.estado,
            notas: c.notas,
            cerradoEn: c.cerradoEn ? new Date(c.cerradoEn as string | number) : null,
            reabiertoVeces: c.reabiertoVeces,
            ultimaReaperturaEn: c.ultimaReaperturaEn
              ? new Date(c.ultimaReaperturaEn as string | number)
              : null,
            actualizadoEn: new Date(c.actualizadoEn as string | number)
          })
          .where(eq(cuadres.id, c.id))
        aceptados.push(c.id)
      } else {
        conflictos.cuadres.push(serverCuadreToCliente(existing[0]!))
      }
    }
  }

  // Cuadre items
  for (const ci of parsed.data.cuadre_items as CuadreItem[]) {
    const existing = await db
      .select()
      .from(cuadreItems)
      .where(eq(cuadreItems.id, ci.id))
      .limit(1)

    if (existing.length === 0) {
      await db.insert(cuadreItems).values({
        id: ci.id,
        cuadreId: ci.cuadreId,
        productoId: ci.productoId,
        precioVentaUsado: String(ci.precioVentaUsado),
        cantidad: String(ci.cantidad),
        subtotal: String(ci.subtotal),
        tipoLinea: ci.tipoLinea,
        nota: ci.nota,
        esExtra: ci.esExtra,
        creadoEn: new Date(ci.creadoEn as string | number),
        actualizadoEn: new Date(ci.actualizadoEn as string | number)
      })
      aceptados.push(ci.id)
    } else {
      const serverTs = new Date(existing[0]!.actualizadoEn).getTime()
      const clientTs = new Date(ci.actualizadoEn as string | number).getTime()

      if (clientTs > serverTs) {
        await db
          .update(cuadreItems)
          .set({
            precioVentaUsado: String(ci.precioVentaUsado),
            cantidad: String(ci.cantidad),
            subtotal: String(ci.subtotal),
            tipoLinea: ci.tipoLinea,
            nota: ci.nota,
            esExtra: ci.esExtra,
            actualizadoEn: new Date(ci.actualizadoEn as string | number)
          })
          .where(eq(cuadreItems.id, ci.id))
        aceptados.push(ci.id)
      } else {
        conflictos.cuadre_items.push(serverCuadreItemToCliente(existing[0]!))
      }
    }
  }

  // Clientes
  for (const cli of parsed.data.clientes as Cliente[]) {
    const existing = await db
      .select()
      .from(clientes)
      .where(eq(clientes.id, cli.id))
      .limit(1)

    if (existing.length === 0) {
      await db.insert(clientes).values({
        id: cli.id,
        puestoId: cli.puestoId,
        nombre: cli.nombre,
        telefono: cli.telefono,
        notas: cli.notas,
        activo: cli.activo,
        creadoEn: new Date(cli.creadoEn as string | number),
        actualizadoEn: new Date(cli.actualizadoEn as string | number)
      })
      aceptados.push(cli.id)
    } else {
      const serverTs = new Date(existing[0]!.actualizadoEn).getTime()
      const clientTs = new Date(cli.actualizadoEn as string | number).getTime()

      if (clientTs > serverTs) {
        await db
          .update(clientes)
          .set({
            nombre: cli.nombre,
            telefono: cli.telefono,
            notas: cli.notas,
            activo: cli.activo,
            actualizadoEn: new Date(cli.actualizadoEn as string | number)
          })
          .where(eq(clientes.id, cli.id))
        aceptados.push(cli.id)
      } else {
        conflictos.clientes.push(serverClienteToCliente(existing[0]!))
      }
    }
  }

  // Cuentas fiado
  for (const cf of parsed.data.cuentas_fiado as CuentaFiado[]) {
    const existing = await db
      .select()
      .from(cuentasFiado)
      .where(eq(cuentasFiado.id, cf.id))
      .limit(1)

    if (existing.length === 0) {
      await db.insert(cuentasFiado).values({
        id: cf.id,
        puestoId: cf.puestoId,
        clienteId: cf.clienteId,
        cuadreOrigenId: cf.cuadreOrigenId,
        montoTotal: String(cf.montoTotal),
        montoPagado: String(cf.montoPagado),
        estado: cf.estado,
        creadoEn: new Date(cf.creadoEn as string | number),
        actualizadoEn: new Date(cf.actualizadoEn as string | number)
      })
      aceptados.push(cf.id)
    } else {
      const serverTs = new Date(existing[0]!.actualizadoEn).getTime()
      const clientTs = new Date(cf.actualizadoEn as string | number).getTime()

      if (clientTs > serverTs) {
        await db
          .update(cuentasFiado)
          .set({
            montoPagado: String(cf.montoPagado),
            estado: cf.estado,
            actualizadoEn: new Date(cf.actualizadoEn as string | number)
          })
          .where(eq(cuentasFiado.id, cf.id))
        aceptados.push(cf.id)
      } else {
        conflictos.cuentas_fiado.push(serverCuentaFiadoToCliente(existing[0]!))
      }
    }
  }

  // Cuentas fiado items (nunca se actualizan)
  for (const ci of parsed.data.cuentas_fiado_items as CuentaFiadoItem[]) {
    const existing = await db
      .select()
      .from(cuentasFiadoItems)
      .where(eq(cuentasFiadoItems.id, ci.id))
      .limit(1)

    if (existing.length === 0) {
      await db.insert(cuentasFiadoItems).values({
        id: ci.id,
        cuentaFiadoId: ci.cuentaFiadoId,
        productoId: ci.productoId,
        cantidad: String(ci.cantidad),
        precioVentaUsado: String(ci.precioVentaUsado),
        subtotal: String(ci.subtotal),
        creadoEn: new Date(ci.creadoEn as string | number)
      })
    }
    aceptados.push(ci.id)
  }

  // Pagos fiado (nunca se actualizan)
  for (const pf of parsed.data.pagos_fiado as PagoFiado[]) {
    const existing = await db
      .select()
      .from(pagosFiado)
      .where(eq(pagosFiado.id, pf.id))
      .limit(1)

    if (existing.length === 0) {
      await db.insert(pagosFiado).values({
        id: pf.id,
        cuentaFiadoId: pf.cuentaFiadoId,
        cuadreId: pf.cuadreId,
        monto: String(pf.monto),
        formaPago: pf.formaPago,
        creadoEn: new Date(pf.creadoEn as string | number)
      })
    }
    aceptados.push(pf.id)
  }

  console.log(`[sync/push] usuario=${auth.usuario.id} aceptados=${aceptados.length} conflictos=${conflictos.productos.length + conflictos.historial_precios.length + conflictos.cuadres.length + conflictos.cuadre_items.length + conflictos.clientes.length + conflictos.cuentas_fiado.length + conflictos.cuentas_fiado_items.length + conflictos.pagos_fiado.length}`)

  return { aceptados, conflictos }
})

function serverRowToProducto(r: typeof productos.$inferSelect): Producto {
  return {
    id: r.id,
    puestoId: r.puestoId,
    nombre: r.nombre,
    descripcion: r.descripcion,
    activo: r.activo,
    orden: r.orden,
    precioCompraActual: Number(r.precioCompraActual),
    precioVentaActual: Number(r.precioVentaActual),
    creadoEn: r.creadoEn.toISOString(),
    actualizadoEn: r.actualizadoEn.toISOString()
  }
}

function serverCuadreToCliente(r: typeof cuadres.$inferSelect): Cuadre {
  return {
    id: r.id,
    puestoId: r.puestoId,
    fecha: r.fecha,
    jefeId: r.jefeId,
    trabajadorTurnoId: r.trabajadorTurnoId,
    pagoTrabajador: r.pagoTrabajador != null ? Number(r.pagoTrabajador) : null,
    totalEsperado: Number(r.totalEsperado),
    totalRealCaja: r.totalRealCaja != null ? Number(r.totalRealCaja) : null,
    montoTransferencia: Number(r.montoTransferencia),
    montoFiado: Number(r.montoFiado),
    montoCobradoFiado: Number(r.montoCobradoFiado ?? 0),
    diferencia: r.diferencia != null ? Number(r.diferencia) : null,
    estado: r.estado,
    notas: r.notas,
    cerradoEn: r.cerradoEn?.toISOString() ?? null,
    reabiertoVeces: r.reabiertoVeces,
    ultimaReaperturaEn: r.ultimaReaperturaEn?.toISOString() ?? null,
    creadoEn: r.creadoEn.toISOString(),
    actualizadoEn: r.actualizadoEn.toISOString()
  }
}

function serverClienteToCliente(r: typeof clientes.$inferSelect): Cliente {
  return {
    id: r.id,
    puestoId: r.puestoId,
    nombre: r.nombre,
    telefono: r.telefono,
    notas: r.notas,
    activo: r.activo,
    creadoEn: r.creadoEn.toISOString(),
    actualizadoEn: r.actualizadoEn.toISOString()
  }
}

function serverCuentaFiadoToCliente(r: typeof cuentasFiado.$inferSelect): CuentaFiado {
  return {
    id: r.id,
    puestoId: r.puestoId,
    clienteId: r.clienteId,
    cuadreOrigenId: r.cuadreOrigenId,
    montoTotal: Number(r.montoTotal),
    montoPagado: Number(r.montoPagado),
    estado: r.estado,
    creadoEn: r.creadoEn.toISOString(),
    actualizadoEn: r.actualizadoEn.toISOString()
  }
}

function serverCuadreItemToCliente(r: typeof cuadreItems.$inferSelect): CuadreItem {
  return {
    id: r.id,
    cuadreId: r.cuadreId,
    productoId: r.productoId,
    precioVentaUsado: Number(r.precioVentaUsado),
    cantidad: Number(r.cantidad),
    subtotal: Number(r.subtotal),
    tipoLinea: r.tipoLinea,
    nota: r.nota,
    esExtra: r.esExtra,
    creadoEn: r.creadoEn.toISOString(),
    actualizadoEn: r.actualizadoEn.toISOString()
  }
}
