import { z } from 'zod'
import { db } from '../../database/client'
import { cuentasFiadoItems } from '../../database/schema'
import { requireRole } from '../../utils/auth'

const crearItemSchema = z.object({
  cuentaFiadoId: z.string(),
  productoId: z.string(),
  cantidad: z.number().min(0),
  precioVentaUsado: z.number().min(0),
  subtotal: z.number().min(0)
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

  const { cuentaFiadoId, productoId, cantidad, precioVentaUsado, subtotal } = parsed.data

  const nuevo = await db
    .insert(cuentasFiadoItems)
    .values({
      cuentaFiadoId,
      productoId,
      cantidad: String(cantidad),
      precioVentaUsado: String(precioVentaUsado),
      subtotal: String(subtotal)
    })
    .returning()

  const i = nuevo[0]!
  return {
    id: i.id,
    cuentaFiadoId: i.cuentaFiadoId,
    productoId: i.productoId,
    cantidad: Number(i.cantidad),
    precioVentaUsado: Number(i.precioVentaUsado),
    subtotal: Number(i.subtotal),
    creadoEn: i.creadoEn.toISOString()
  }
})
