/**
 * server-offline/sync/pull.js
 *
 * Aplica un resultado de pull (proveniente del server) a la DB local.
 * Incluye aplicación de deletes recibidos del servidor.
 */
import { TABLES } from '~~/shared/tables'
import { removePendingDeletesAccepted } from '../_factory'

const SYNC_TABLAS = Object.values(TABLES)

export async function pull(pullResult, _opts, _auth) {
  void _opts
  void _auth
  let aplicados = 0
  let deletesAplicados = 0

  for (const cfg of SYNC_TABLAS) {
    const registros = pullResult[cfg.tabla]
    if (!registros?.length) continue
    const repo = useLocalRepo(cfg)
    for (const reg of registros) {
      const existing = await repo.read(reg.id)
      if (existing) {
        await repo.update(reg.id, { ...reg, sincronizado: 1 })
      } else {
        await repo.create({ ...reg, sincronizado: 1 })
      }
      aplicados++
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
