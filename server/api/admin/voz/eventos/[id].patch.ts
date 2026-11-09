import { eq } from 'drizzle-orm'
import { requireSuperAdmin } from '../../../../utils/auth'
import { db } from '../../../../database/client'
import { vozEventos } from '../../../../database/schema'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Id requerido.' })

  const body = await readBody(event).catch(() => ({})) as { estado?: string, nota?: string }
  const estado = body.estado
  const nota = body.nota

  const patch: Record<string, unknown> = {}
  if (estado && ['abierto', 'resuelto', 'descartado'].includes(estado)) patch.estado = estado
  if (typeof nota === 'string') patch.nota = nota
  if (Object.keys(patch).length === 0) return { ok: true, actualizado: 0 }

  const [updated] = await db.update(vozEventos).set(patch).where(eq(vozEventos.id, id)).returning()
  return { ok: true, actualizado: updated ? 1 : 0 }
})
