import { and, eq, asc, inArray } from 'drizzle-orm'
import { db } from '../../database/client'
import { productos, historialPrecios } from '../../database/schema'
import { requireAuth } from '../../utils/auth'
import { agruparPreciosVigentes } from '#shared/precioVigente'

/**
 * GET /api/sync/productos-activos
 *
 * Devuelve solo los productos activos del catálogo.
 *
 * Fase 12 (derivación determinista): el precio de venta vigente se calcula
 * a partir de `historial_precios` (eventos append-only), con un tie-break
 * determinista, en vez de confiar en `productos.precioVentaActual` (snapshot
 * mutable). Esto hace que las ediciones concurrentes offline no sobrescriban
 * silenciosamente el precio: si varios dispositivos rotaron precio, la regla
 * elige siempre la misma vigente en todos los aparatos.
 *
 * Se mantiene `precioVentaActual` como fallback para productos viejos sin
 * historial, y se envía ya derivado (la app no cambia).
 */
export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event, 'sync')
  const puestoId = auth.usuario.puestoId

  const rows = await db.select({ id: productos.id, nombre: productos.nombre, precioVentaActual: productos.precioVentaActual, orden: productos.orden }).from(productos).where(and(eq(productos.activo, true), eq(productos.puestoId, puestoId))).orderBy(asc(productos.orden))

  const fallbackPorProducto: Record<string, number> = Object.fromEntries(rows.map(r => [r.id, r.precioVentaActual]))

  const idsProductos = rows.map(r => r.id)
  let historial: any[] = []
  if (idsProductos.length) {
    historial = await db.select({ productoId: historialPrecios.productoId, precioVenta: historialPrecios.precioVenta, vigenteDesde: historialPrecios.vigenteDesde, vigenteHasta: historialPrecios.vigenteHasta, actualizadoEn: historialPrecios.actualizadoEn, id: historialPrecios.id }).from(historialPrecios).where(inArray(historialPrecios.productoId, idsProductos))
  }

  const preciosVigentes = agruparPreciosVigentes(historial, fallbackPorProducto) as Record<string, number>

  return rows.map(r => ({ id: r.id, nombre: r.nombre, precioVentaActual: preciosVigentes[r.id] ?? r.precioVentaActual, orden: r.orden }))
})
