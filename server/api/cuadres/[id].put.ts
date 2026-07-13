import { eq } from 'drizzle-orm'
import { db } from '../../database/client'
import { cuadres } from '../../database/schema'
import { requireRole } from '../../utils/auth'
import { replaceCuadreSchema } from '../../../shared/schemas'

export default defineEventHandler(async (event) => {
  await requireRole(event, 'jefe')

  const id = event.context.params?.id
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'ID requerido.' })
  }

  const body = await readBody(event)
  const parsed = replaceCuadreSchema.safeParse(body)

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Datos inválidos.',
      data: parsed.error.flatten()
    })
  }

  const d = parsed.data

  const actualizado = await db
    .update(cuadres)
    .set({
      totalEsperado: String(d.totalEsperado),
      totalRealCaja: d.totalRealCaja !== null ? String(d.totalRealCaja) : null,
      montoTransferencia: String(d.montoTransferencia),
      montoFiado: String(d.montoFiado),
      diferencia: d.diferencia !== null ? String(d.diferencia) : null,
      estado: d.estado,
      notas: d.notas ?? null,
      cerradoEn: d.cerradoEn ? new Date(d.cerradoEn) : null,
      reabiertoVeces: d.reabiertoVeces,
      ultimaReaperturaEn: d.ultimaReaperturaEn ? new Date(d.ultimaReaperturaEn) : null,
      trabajadorTurnoId: d.trabajadorTurnoId ?? null,
      pagoTrabajador: d.pagoTrabajador !== null ? String(d.pagoTrabajador) : null,
      actualizadoEn: new Date()
    })
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
