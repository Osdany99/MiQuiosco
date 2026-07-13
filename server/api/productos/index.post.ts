import { db } from '../../database/client'
import { productos, historialPrecios } from '../../database/schema'
import { requireAuth } from '../../utils/auth'
import { createProductoSchema } from '../../../shared/schemas'

/**
 * POST /api/productos
 *
 * Crea un nuevo producto (admin o jefe).
 */
export default defineEventHandler(async (event) => {
  const { usuario } = await requireAuth(event, 'sync')
  if (usuario.rol !== 'jefe') {
    throw createError({ statusCode: 403, statusMessage: 'Acceso denegado.' })
  }

  const body = await readBody(event)
  const parsed = createProductoSchema.safeParse(body)

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Datos inválidos.',
      data: parsed.error.flatten()
    })
  }

  const {
    nombre,
    descripcion,
    precioCompraActual,
    precioVentaActual,
    orden = 0,
    activo = true
  } = parsed.data

  const puestoId = usuario.puestoId

  const nuevoProducto = await db
    .insert(productos)
    .values({
      puestoId,
      nombre,
      descripcion,
      activo,
      orden,
      precioCompraActual: String(precioCompraActual),
      precioVentaActual: String(precioVentaActual)
    })
    .returning()

  const p = nuevoProducto[0]!

  // Crear primer registro en historial de precios
  await db.insert(historialPrecios).values({
    productoId: p.id,
    precioCompra: String(precioCompraActual),
    precioVenta: String(precioVentaActual),
    vigenteDesde: new Date(),
    cambiadoPor: usuario.id
  })

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
