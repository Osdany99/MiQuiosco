import { desc, eq, isNull, or } from 'drizzle-orm'
import { requireSuperAdmin } from '../../../utils/auth'
import { db } from '../../../database/client'
import { vozEventos, puestos } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const query = getQuery(event)
  const estado = typeof query.estado === 'string' ? query.estado : undefined
  const limit = Math.min(Math.max(Number(query.limit) || 200, 1), 1000)

  // El filtro va en SQL: antes se traían hasta 1000 filas y se descartaban en
  // memoria, así que un estado con pocos eventos podía quedar fuera del límite.
  // `estado` es nullable y los registros viejos sin estado cuentan como abiertos.
  const filtro = !estado || estado === 'todos'
    ? undefined
    : (estado === 'abierto'
        ? or(eq(vozEventos.estado, 'abierto'), isNull(vozEventos.estado))
        : eq(vozEventos.estado, estado))

  const base = db
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

  const q = filtro ? base.where(filtro) : base
  return q.orderBy(desc(vozEventos.ultimoEn)).limit(limit)
})
