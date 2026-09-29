/**
 * server-offline/sync/pull.js
 *
 * Aplica un resultado de pull (proveniente del server) a la DB local.
 * Incluye aplicación de deletes recibidos del servidor.
 */
import { TABLES } from '../../../../shared/tables'
import { removePendingDeletesAccepted, enrichForInsert, enrichForUpdate } from '../_factory'
import { useDb } from '../../db/client'

const SYNC_TABLAS = Object.values(TABLES)

async function upsertRegistro(cfg, reg) {
  const db = useDb()
  const existing = await db.getById(cfg.tabla, reg.id)
  if (existing) {
    // No pisar ediciones locales aún no subidas (sincronizado = 0):
    // se resuelven vía push / conflicto, donde el timestamp decide.
    // Sin esto, un pull tras el login borra cambios locales pendientes.
    if (!existing.sincronizado) return false
    await db.update(cfg.tabla, reg.id, enrichForUpdate(cfg.tabla, { ...reg, sincronizado: 1 }))
    return true
  }
  await db.insert(cfg.tabla, enrichForInsert(cfg.tabla, { ...reg, sincronizado: 1 }))
  return true
}

export async function pull(pullResult, _opts, _auth) {
  void _opts
  void _auth
  let aplicados = 0
  let deletesAplicados = 0

  for (const cfg of SYNC_TABLAS) {
    const registros = pullResult[cfg.tabla]
    if (!registros?.length) continue
    for (const reg of registros) {
      if (await upsertRegistro(cfg, reg)) aplicados++
    }
  }

  const deletes = pullResult.deletes ?? []
  for (const del of deletes) {
    const cfg = SYNC_TABLAS.find(t => t.tabla === del.tabla)
    if (!cfg) continue
    const repo = useLocalRepo(cfg)
    try {
      await repo.remove(del.id)
      deletesAplicados++
    } catch {
      // registro ya no existe localmente
    }
  }

  if (deletes.length > 0) {
    await removePendingDeletesAccepted(deletes)
  }

  return { aplicados, deletesAplicados }
}
