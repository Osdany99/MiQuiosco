import { asc } from 'drizzle-orm'
import { db } from '../../database/client'
import { cuadres } from '../../database/schema'
import { requireRole } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireRole(event, 'jefe')

  const rows = await db
    .select()
    .from(cuadres)
    .orderBy(asc(cuadres.fecha))

  return rows.map(c => ({
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
    montoCobradoFiado: Number(c.montoCobradoFiado ?? 0),
    diferencia: c.diferencia ? Number(c.diferencia) : null,
    estado: c.estado,
    notas: c.notas,
    cerradoEn: c.cerradoEn?.toISOString() ?? null,
    reabiertoVeces: c.reabiertoVeces,
    ultimaReaperturaEn: c.ultimaReaperturaEn?.toISOString() ?? null,
    creadoEn: c.creadoEn.toISOString(),
    actualizadoEn: c.actualizadoEn.toISOString()
  }))
})
