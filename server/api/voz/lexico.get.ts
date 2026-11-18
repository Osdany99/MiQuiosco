import { requireAuth } from '../../utils/auth'
import { exigirDispositivoActivo } from '../../utils/dispositivo'
import { db } from '../../database/client'
import { vozLexico } from '../../database/schema'
import { gt, asc } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event, 'sync')
  const puestoId = auth.usuario.puestoId
  await exigirDispositivoActivo(event, puestoId)

  const desde = Number(getQuery(event).desde) || 0
  let base = db.select().from(vozLexico).orderBy(asc(vozLexico.version))
  if (desde > 0) {
    base = base.where(gt(vozLexico.version, desde)) as typeof base
  }
  const rows = await base
  const version = rows.reduce((max, r) => Math.max(max, r.version || 0), desde)
  return {
    schema: 1,
    version,
    entradas: rows.map(r => ({
      id: r.id,
      categoria: r.categoria,
      valor: r.valor,
      clave: r.clave ?? null,
      activo: r.activo,
      version: r.version
    }))
  }
})
