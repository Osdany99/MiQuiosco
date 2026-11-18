import { sql } from 'drizzle-orm'
import { requireSuperAdmin } from '../../../utils/auth'
import { db } from '../../../database/client'
import { vozConfirmaciones, vozEventos } from '../../../database/schema'

/**
 * Salud del módulo de voz para el panel: qué tan vieja es la telemetría y si la
 * cadena completa (evento → proof → servidor) está viva. Sin esto, el panel
 * solo muestra filas y no dice si algo dejó de llegar.
 */
export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const [eventos] = await db.select({
    total: sql<number>`count(*)`,
    abiertos: sql<number>`count(*) filter (where ${vozEventos.estado} is null or ${vozEventos.estado} = 'abierto')`,
    ultimoEn: sql<string | null>`max(${vozEventos.ultimoEn})`
  }).from(vozEventos)

  const [confirmaciones] = await db.select({
    total: sql<number>`count(*)`,
    ultimos7d: sql<number>`count(*) filter (where ${vozConfirmaciones.creadoEn} >= now() - interval '7 days')`,
    ultimaEn: sql<string | null>`max(${vozConfirmaciones.creadoEn})`
  }).from(vozConfirmaciones)

  return {
    eventos: {
      total: Number(eventos?.total ?? 0),
      abiertos: Number(eventos?.abiertos ?? 0),
      ultimoEn: eventos?.ultimoEn ?? null
    },
    confirmaciones: {
      total: Number(confirmaciones?.total ?? 0),
      ultimos7d: Number(confirmaciones?.ultimos7d ?? 0),
      ultimaEn: confirmaciones?.ultimaEn ?? null
    }
  }
})
