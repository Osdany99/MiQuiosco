import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../../database/client'
import {
  productos,
  historialPrecios,
  cuadres,
  cuadreItems
} from '../../database/schema'
import { requireAuth } from '../../utils/auth'
import type { PushResponse, Producto, HistorialPrecio, Cuadre, CuadreItem } from '../../../shared/types'

const pushSchema = z.object({
  productos: z.array(z.any()).default([]),
  historial_precios: z.array(z.any()).default([]),
  cuadres: z.array(z.any()).default([]),
  cuadre_items: z.array(z.any()).default([])
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
    cuadre_items: []
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

  console.log(`[sync/push] usuario=${auth.usuario.id} aceptados=${aceptados.length} conflictos=${conflictos.productos.length + conflictos.historial_precios.length + conflictos.cuadres.length + conflictos.cuadre_items.length}`)

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
