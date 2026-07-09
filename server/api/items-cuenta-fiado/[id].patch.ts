import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../../database/client'
import { cuentasFiadoItems } from '../../database/schema'
import { requireRole } from '../../utils/auth'

const editarItemSchema = z.object({
  cantidad: z.number().min(0).optional(),
  precioVentaUsado: z.number().min(0).optional(),
  subtotal: z.number().min(0).optional()
})

export default defineEventHandler(async (event) => {
  await requireRole(event, 'jefe')

  const id = event.context.params?.id
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'ID requerido.' })
  }

  const body = await readBody(event)
  const parsed = editarItemSchema.safeParse(body)

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Datos inválidos.',
      data: parsed.error.flatten()
    })
  }

  const updateData: Record<string, unknown> = {}
  if (parsed.data.cantidad !== undefined) updateData.cantidad = String(parsed.data.cantidad)
  if (parsed.data.precioVentaUsado !== undefined) updateData.precioVentaUsado = String(parsed.data.precioVentaUsado)
  if (parsed.data.subtotal !== undefined) updateData.subtotal = String(parsed.data.subtotal)

  if (Object.keys(updateData).length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Nada que actualizar.' })
  }

  const actualizado = await db
    .update(cuentasFiadoItems)
    .set(updateData)
    .where(eq(cuentasFiadoItems.id, id))
    .returning()

  if (actualizado.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Item no encontrado.' })
  }

  const i = actualizado[0]!
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
