import { z } from 'zod'
import { db } from '../../database/client'
import { cuadres } from '../../database/schema'
import { requireRole } from '../../utils/auth'

const crearCuadreSchema = z.object({
  fecha: z.string(),
  estado: z.enum(['abierto', 'cerrado']).optional(),
  totalEsperado: z.number().min(0).optional(),
  notas: z.string().nullable().optional()
})

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')

  const body = await readBody(event)
  const parsed = crearCuadreSchema.safeParse(body)

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Datos inválidos.',
      data: parsed.error.flatten()
    })
  }

  const { fecha, estado = 'abierto', totalEsperado = 0, notas = null } = parsed.data

  const nuevo = await db
    .insert(cuadres)
    .values({
      puestoId: auth.usuario.puestoId,
      jefeId: auth.usuario.id,
      fecha,
      estado,
      totalEsperado: String(totalEsperado),
      notas
    })
    .returning()

  const c = nuevo[0]!
  return {
    id: c.id,
    puestoId: c.puestoId,
    fecha: c.fecha,
    jefeId: c.jefeId,
    trabajadorTurnoId: null,
    pagoTrabajador: null,
    totalEsperado: Number(c.totalEsperado),
    totalRealCaja: null,
    montoTransferencia: 0,
    montoFiado: 0,
    diferencia: null,
    estado: c.estado,
    notas: c.notas,
    cerradoEn: null,
    reabiertoVeces: 0,
    ultimaReaperturaEn: null,
    creadoEn: c.creadoEn.toISOString(),
    actualizadoEn: c.actualizadoEn.toISOString()
  }
})
