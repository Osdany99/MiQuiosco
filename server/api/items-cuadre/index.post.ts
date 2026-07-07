import { z } from 'zod'
import { db } from '../../database/client'
import { cuadreItems } from '../../database/schema'
import { requireRole } from '../../utils/auth'

const crearItemSchema = z.object({
  cuadreId: z.string(),
  productoId: z.string(),
  precioVentaUsado: z.number().min(0),
  cantidad: z.number().min(0),
  subtotal: z.number().min(0),
  tipoLinea: z.enum(['normal', 'regalo', 'descuento_familiar']).optional(),
  nota: z.string().nullable().optional(),
  esExtra: z.boolean().optional()
})

export default defineEventHandler(async (event) => {
  await requireRole(event, 'jefe')

  const body = await readBody(event)
  const parsed = crearItemSchema.safeParse(body)

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Datos inválidos.',
      data: parsed.error.flatten()
    })
  }

  const { cuadreId, productoId, precioVentaUsado, cantidad, subtotal, tipoLinea = 'normal', nota = null, esExtra = false } = parsed.data

  const nuevo = await db
    .insert(cuadreItems)
    .values({
      cuadreId,
      productoId,
      precioVentaUsado: String(precioVentaUsado),
      cantidad: String(cantidad),
      subtotal: String(subtotal),
      tipoLinea,
      nota,
      esExtra
    })
    .returning()

  const i = nuevo[0]!
  return {
    id: i.id,
    cuadreId: i.cuadreId,
    productoId: i.productoId,
    precioVentaUsado: Number(i.precioVentaUsado),
    cantidad: Number(i.cantidad),
    subtotal: Number(i.subtotal),
    tipoLinea: i.tipoLinea,
    nota: i.nota,
    esExtra: i.esExtra,
    creadoEn: i.creadoEn.toISOString(),
    actualizadoEn: i.actualizadoEn.toISOString()
  }
})
