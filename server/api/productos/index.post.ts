import { z } from 'zod'
import { db } from '../../database/client'
import { productos, historialPrecios } from '../../database/schema'
import { requireRole, requireAuth } from '../../utils/auth'

const crearProductoSchema = z.object({
  nombre: z.string().min(1).max(100),
  descripcion: z.string().nullable().optional(),
  precioCompraActual: z.number().min(0),
  precioVentaActual: z.number().min(0),
  orden: z.number().int().min(0).optional(),
  activo: z.boolean().optional()
})

/**
 * POST /api/productos
 *
 * Crea un nuevo producto. Si se proporcionan precios de compra/venta,
 * crea el primer registro en historial_precios con vigente_hasta = NULL.
 */
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin')

  const body = await readBody(event)
  const parsed = crearProductoSchema.safeParse(body)

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

  // Obtener puesto_id del usuario autenticado
  const auth = await requireAuth(event, 'admin')
  const puestoId = auth.usuario.puestoId

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
    cambiadoPor: auth.usuario.id
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
