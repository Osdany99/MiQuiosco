import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../../database/client'
import { cuadreItems } from '../../database/schema'
import { requireRole } from '../../utils/auth'

const editarItemSchema = z.object({
  precioVentaUsado: z.number().min(0).optional(),
  cantidad: z.number().min(0).optional(),
  subtotal: z.number().min(0).optional(),
  tipoLinea: z.enum(['normal', 'descuento']).optional(),
  nota: z.string().nullable().optional(),
  esExtra: z.boolean().optional()
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
  if (parsed.data.precioVentaUsado !== undefined) updateData.precioVentaUsado = String(parsed.data.precioVentaUsado)
  if (parsed.data.cantidad !== undefined) updateData.cantidad = String(parsed.data.cantidad)
  if (parsed.data.subtotal !== undefined) updateData.subtotal = String(parsed.data.subtotal)
  if (parsed.data.tipoLinea !== undefined) updateData.tipoLinea = parsed.data.tipoLinea
  if (parsed.data.nota !== undefined) updateData.nota = parsed.data.nota
  if (parsed.data.esExtra !== undefined) updateData.esExtra = parsed.data.esExtra

  if (Object.keys(updateData).length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Nada que actualizar.' })
  }

  updateData.actualizadoEn = new Date()

  const actualizado = await db
    .update(cuadreItems)
    .set(updateData)
    .where(eq(cuadreItems.id, id))
    .returning()

  if (actualizado.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Item no encontrado.' })
  }

  const i = actualizado[0]!
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
