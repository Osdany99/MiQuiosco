import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm'
import { db } from '../../database/client'
import { ventasDirectas, ventasDirectasItems, productos, usuarios } from '../../database/schema'
import { requireRole } from '../../utils/auth'

/**
 * Listado de ventas directas para la pestaña /deudas (y la gráfica de
 * ingresos directos). Opcionalmente acotado por fecha.
 */
export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const query = getQuery(event)

  const conditions = [eq(ventasDirectas.puestoId, auth.usuario.puestoId)]
  if (query.desde) conditions.push(gte(ventasDirectas.creadoEn, new Date(String(query.desde))))
  if (query.hasta) {
    conditions.push(sql`${ventasDirectas.creadoEn} <= ${new Date(String(query.hasta))}`)
  }

  const rows = await db
    .select({
      id: ventasDirectas.id,
      ubicacionVenta: ventasDirectas.ubicacionVenta,
      montoTotal: ventasDirectas.montoTotal,
      costoTotal: ventasDirectas.costoTotal,
      ganancia: ventasDirectas.ganancia,
      notas: ventasDirectas.notas,
      anulado: ventasDirectas.anulado,
      creadoEn: ventasDirectas.creadoEn,
      nombreUsuario: usuarios.nombre
    })
    .from(ventasDirectas)
    .innerJoin(usuarios, eq(ventasDirectas.usuarioId, usuarios.id))
    .where(and(...conditions))
    .orderBy(desc(ventasDirectas.creadoEn))

  if (rows.length === 0) return []

  const ids = rows.map(r => r.id)
  const items = await db
    .select({
      ventaDirectaId: ventasDirectasItems.ventaDirectaId,
      productoId: ventasDirectasItems.productoId,
      nombreProducto: productos.nombre,
      unidad: productos.unidad,
      cantidad: ventasDirectasItems.cantidad,
      precioVentaUsado: ventasDirectasItems.precioVentaUsado,
      subtotal: ventasDirectasItems.subtotal,
      costoUnitario: ventasDirectasItems.costoUnitario,
      costoTotal: ventasDirectasItems.costoTotal,
      secuencia: ventasDirectasItems.secuencia
    })
    .from(ventasDirectasItems)
    .innerJoin(productos, eq(ventasDirectasItems.productoId, productos.id))
    .where(inArray(ventasDirectasItems.ventaDirectaId, ids))

  const porVenta = new Map()
  for (const it of items) {
    if (!porVenta.has(it.ventaDirectaId)) porVenta.set(it.ventaDirectaId, [])
    porVenta.get(it.ventaDirectaId).push(it)
  }

  return rows.map(r => ({
    id: r.id,
    ubicacion: r.ubicacionVenta,
    montoTotal: r.montoTotal,
    costoTotal: r.costoTotal,
    ganancia: r.ganancia,
    notas: r.notas,
    anulado: r.anulado,
    nombreUsuario: r.nombreUsuario,
    creadoEn: r.creadoEn.toISOString(),
    lineas: (porVenta.get(r.id) ?? []).sort(
      (a: { secuencia: number }, b: { secuencia: number }) => a.secuencia - b.secuencia
    )
  }))
})
