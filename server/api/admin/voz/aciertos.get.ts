import { and, desc, eq, sql } from 'drizzle-orm'
import { requireSuperAdmin } from '../../../utils/auth'
import { db } from '../../../database/client'
import { puestos, vozAciertos } from '../../../database/schema'
import { filtroAciertosVozSchema } from '#shared/schemas/vozAciertos'

/**
 * GET /api/admin/voz/aciertos — dictados entendidos, con filtros de diagnóstico.
 *
 * El panel los muestra tal cual llegaron: comando interpretado, acción aplicada
 * y (si la captura de texto está encendida) la frase cruda.
 */
export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const query = getQuery(event)
  const datos = {
    comando: typeof query.comando === 'string' && query.comando.trim()
      ? query.comando.trim()
      : undefined,
    motor: typeof query.motor === 'string' && query.motor.trim()
      ? query.motor.trim()
      : undefined,
    desde: ['24h', '7d', 'todo'].includes(String(query.desde))
      ? String(query.desde)
      : undefined,
    texto: typeof query.texto === 'string' && query.texto.trim()
      ? query.texto.trim()
      : undefined,
    limit: Number(query.limit) || undefined
  }
  const parsed = filtroAciertosVozSchema.safeParse(datos)
  const filtro = parsed.success ? parsed.data : {}
  const limit = filtro.limit ?? 300

  const condiciones = []
  if (filtro.comando) condiciones.push(eq(vozAciertos.comando, filtro.comando))
  if (filtro.motor) condiciones.push(eq(vozAciertos.motor, filtro.motor))
  if (filtro.desde === '24h') {
    condiciones.push(sql`${vozAciertos.creadoEn} >= now() - interval '24 hours'`)
  } else if (filtro.desde === '7d') {
    condiciones.push(sql`${vozAciertos.creadoEn} >= now() - interval '7 days'`)
  }
  if (filtro.texto) {
    condiciones.push(sql`coalesce(${vozAciertos.texto}, '') ilike ${`%${filtro.texto}%`}`)
  }

  const base = db
    .select({
      id: vozAciertos.id,
      puestoId: vozAciertos.puestoId,
      puestoNombre: puestos.nombre,
      dispositivoId: vozAciertos.dispositivoId,
      comando: vozAciertos.comando,
      resultado: vozAciertos.resultado,
      detalle: vozAciertos.detalle,
      texto: vozAciertos.texto,
      confianza: vozAciertos.confianza,
      motor: vozAciertos.motor,
      appVersion: vozAciertos.appVersion,
      creadoEn: vozAciertos.creadoEn
    })
    .from(vozAciertos)
    .leftJoin(puestos, eq(puestos.id, vozAciertos.puestoId))

  const q = condiciones.length ? base.where(and(...condiciones)) : base
  return q.orderBy(desc(vozAciertos.creadoEn)).limit(limit)
})
