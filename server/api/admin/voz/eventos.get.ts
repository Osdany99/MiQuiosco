import { desc, eq } from 'drizzle-orm'
import { requireSuperAdmin } from '../../../utils/auth'
import { db } from '../../../database/client'
import { vozEventos, puestos } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const query = getQuery(event)
  const estado = typeof query.estado === 'string' ? query.estado : undefined
  const limit = Math.min(Math.max(Number(query.limit) || 200, 1), 1000)

  const q = db
    .select({
      id: vozEventos.id,
      puestoId: vozEventos.puestoId,
      puestoNombre: puestos.nombre,
      dispositivoId: vozEventos.dispositivoId,
      comando: vozEventos.comando,
      motivo: vozEventos.motivo,
      plantilla: vozEventos.plantilla,
      confianza: vozEventos.confianza,
      intentos: vozEventos.intentos,
      estado: vozEventos.estado,
      ultimoEn: vozEventos.ultimoEn
    })
    .from(vozEventos)
    .leftJoin(puestos, eq(puestos.id, vozEventos.puestoId))
    .orderBy(desc(vozEventos.ultimoEn))
    .limit(limit)

  const all = await q
  if (!estado || estado === 'todos') return all
  return all.filter((x) => String(x.estado ?? 'abierto') === estado)
})
