import { eq, sql } from 'drizzle-orm'
import { requireSuperAdmin } from '../../../../utils/auth'
import { db } from '../../../../database/client'
import { vozLexico } from '../../../../database/schema'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Id requerido.' })

  const body = await readBody(event).catch(() => ({})) as { activo?: boolean, nota?: string }
  const [actual] = await db.select().from(vozLexico).where(eq(vozLexico.id, id)).limit(1)
  if (!actual) throw createError({ statusCode: 404, statusMessage: 'Entrada no encontrada.' })

  const [maxRow] = await db.select({ m: sql`coalesce(max(${vozLexico.version}), 0)` }).from(vozLexico)
  const version = Number(maxRow?.m || 0) + 1

  const patch: Record<string, unknown> = { actualizadoEn: sql`now()`, version }
  if (typeof body.activo === 'boolean') patch.activo = body.activo
  if (typeof body.nota === 'string') patch.nota = body.nota

  const [updated] = await db.update(vozLexico).set(patch).where(eq(vozLexico.id, id)).returning()
  return updated
})
