import { eq, and, isNull } from 'drizzle-orm'
import { db } from '../../database/client'
import { productos, historialPrecios } from '../../database/schema'
import { requireAuth } from '../../utils/auth'
import { updateProductoSchema } from '../../../shared/schemas'

export default defineEventHandler(async (event) => {
  const { usuario } = await requireAuth(event, 'sync')
  if (usuario.rol !== 'jefe') {
    throw createError({ statusCode: 403, statusMessage: 'Acceso denegado.' })
  }

  const id = event.context.params?.id
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'ID requerido.' })
  }

  const body = await readBody(event)
  const parsed = updateProductoSchema.safeParse(body)

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Datos inválidos.',
      data: parsed.error.flatten()
    })
  }

  // Obtener valores actuales antes de cualquier mutación
  const current = await db
    .select({
      precioCompraActual: productos.precioCompraActual,
      precioVentaActual: productos.precioVentaActual
    })
    .from(productos)
    .where(eq(productos.id, id))
    .limit(1)

  if (current.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Producto no encontrado.' })
  }

  const updateData: Record<string, unknown> = {}
  let precioCambiado = false

  if (parsed.data.nombre !== undefined) updateData.nombre = parsed.data.nombre
  if (parsed.data.descripcion !== undefined) updateData.descripcion = parsed.data.descripcion
  if (parsed.data.orden !== undefined) updateData.orden = parsed.data.orden
  if (parsed.data.activo !== undefined) updateData.activo = parsed.data.activo

  if (parsed.data.precioCompraActual !== undefined) {
    updateData.precioCompraActual = String(parsed.data.precioCompraActual)
    if (parsed.data.precioCompraActual !== Number(current[0]!.precioCompraActual)) {
      precioCambiado = true
    }
  }
  if (parsed.data.precioVentaActual !== undefined) {
    updateData.precioVentaActual = String(parsed.data.precioVentaActual)
    if (parsed.data.precioVentaActual !== Number(current[0]!.precioVentaActual)) {
      precioCambiado = true
    }
  }

  if (Object.keys(updateData).length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Nada que actualizar.' })
  }

  updateData.actualizadoEn = new Date()

  const cambiadoPor = usuario.id

  if (precioCambiado) {
    // Cerrar solo el registro actualmente vigente (vigente_hasta IS NULL)
    await db
      .update(historialPrecios)
      .set({ vigenteHasta: new Date() })
      .where(
        and(
          eq(historialPrecios.productoId, id),
          isNull(historialPrecios.vigenteHasta)
        )
      )

    const precioCompraNuevo = updateData.precioCompraActual ?? String(current[0]!.precioCompraActual)
    const precioVentaNuevo = updateData.precioVentaActual ?? String(current[0]!.precioVentaActual)
    await db.insert(historialPrecios).values({
      productoId: id,
      precioCompra: precioCompraNuevo,
      precioVenta: precioVentaNuevo,
      vigenteDesde: new Date(),
      cambiadoPor
    } as typeof historialPrecios.$inferInsert)
  }

  const actualizado = await db
    .update(productos)
    .set(updateData)
    .where(eq(productos.id, id))
    .returning()

  const p = actualizado[0]!
  return {
    id: p.id,
    puestoId: p.puestoId,
    nombre: p.nombre,
    descripcion: p.descripcion,
    activo: p.activo,
    orden: p.orden,
    precioCompraActual: Number(p.precioCompraActual),
    precioVentaActual: Number(p.precioVentaActual),
    creadoEn: p.creadoEn.toISOString(),
    actualizadoEn: p.actualizadoEn.toISOString()
  }
})
