import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../../database/client'
import { cuadres } from '../../database/schema'
import { requireRole } from '../../utils/auth'

const editarCuadreSchema = z.object({
  totalEsperado: z.number().min(0).optional(),
  totalRealCaja: z.number().min(0).nullable().optional(),
  montoTransferencia: z.number().min(0).optional(),
  montoFiado: z.number().min(0).optional(),
  diferencia: z.number().nullable().optional(),
  estado: z.enum(['abierto', 'cerrado']).optional(),
  notas: z.string().nullable().optional(),
  cerradoEn: z.number().nullable().optional(),
  reabiertoVeces: z.number().int().optional(),
  ultimaReaperturaEn: z.number().nullable().optional(),
  trabajadorTurnoId: z.string().nullable().optional(),
  pagoTrabajador: z.number().min(0).nullable().optional()
})

export default defineEventHandler(async (event) => {
  await requireRole(event, 'jefe')

  const id = event.context.params?.id
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'ID requerido.' })
  }

  const body = await readBody(event)
  const parsed = editarCuadreSchema.safeParse(body)

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Datos inválidos.',
      data: parsed.error.flatten()
    })
  }

  const updateData: Record<string, unknown> = {}
  if (parsed.data.totalEsperado !== undefined) updateData.totalEsperado = String(parsed.data.totalEsperado)
  if (parsed.data.totalRealCaja !== undefined) updateData.totalRealCaja = parsed.data.totalRealCaja !== null ? String(parsed.data.totalRealCaja) : null
  if (parsed.data.montoTransferencia !== undefined) updateData.montoTransferencia = String(parsed.data.montoTransferencia)
  if (parsed.data.montoFiado !== undefined) updateData.montoFiado = String(parsed.data.montoFiado)
  if (parsed.data.diferencia !== undefined) updateData.diferencia = parsed.data.diferencia !== null ? String(parsed.data.diferencia) : null
  if (parsed.data.estado !== undefined) updateData.estado = parsed.data.estado
  if (parsed.data.notas !== undefined) updateData.notas = parsed.data.notas
  if (parsed.data.cerradoEn !== undefined) updateData.cerradoEn = parsed.data.cerradoEn ? new Date(parsed.data.cerradoEn) : null
  if (parsed.data.reabiertoVeces !== undefined) updateData.reabiertoVeces = parsed.data.reabiertoVeces
  if (parsed.data.ultimaReaperturaEn !== undefined) updateData.ultimaReaperturaEn = parsed.data.ultimaReaperturaEn ? new Date(parsed.data.ultimaReaperturaEn) : null
  if (parsed.data.trabajadorTurnoId !== undefined) updateData.trabajadorTurnoId = parsed.data.trabajadorTurnoId
  if (parsed.data.pagoTrabajador !== undefined) updateData.pagoTrabajador = parsed.data.pagoTrabajador !== null ? String(parsed.data.pagoTrabajador) : null

  if (Object.keys(updateData).length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Nada que actualizar.' })
  }

  updateData.actualizadoEn = new Date()

  const actualizado = await db
    .update(cuadres)
    .set(updateData)
    .where(eq(cuadres.id, id))
    .returning()

  if (actualizado.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Cuadre no encontrado.' })
  }

  const c = actualizado[0]!
  return {
    id: c.id,
    puestoId: c.puestoId,
    fecha: c.fecha,
    jefeId: c.jefeId,
    trabajadorTurnoId: c.trabajadorTurnoId,
    pagoTrabajador: c.pagoTrabajador ? Number(c.pagoTrabajador) : null,
    totalEsperado: Number(c.totalEsperado),
    totalRealCaja: c.totalRealCaja ? Number(c.totalRealCaja) : null,
    montoTransferencia: Number(c.montoTransferencia),
    montoFiado: Number(c.montoFiado),
    diferencia: c.diferencia ? Number(c.diferencia) : null,
    estado: c.estado,
    notas: c.notas,
    cerradoEn: c.cerradoEn?.toISOString() ?? null,
    reabiertoVeces: c.reabiertoVeces,
    ultimaReaperturaEn: c.ultimaReaperturaEn?.toISOString() ?? null,
    creadoEn: c.creadoEn.toISOString(),
    actualizadoEn: c.actualizadoEn.toISOString()
  }
})
