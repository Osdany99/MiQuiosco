/**
 * server-offline/sync/push.js
 *
 * Prepara el payload de push: reúne todos los registros con sincronizado = 0
 * de cada tabla sincronizable, listos para enviar al servidor.
 * Incluye deletes pendientes.
 */
import { TABLES } from '~~/shared/tables'
import { getPendingDeletes } from '../_factory'

const SYNC_TABLAS = Object.values(TABLES)

export async function push(opts, auth) {
  void opts
  void auth
  const result = {}
  for (const cfg of SYNC_TABLAS) {
    const repo = useLocalRepo(cfg)
    const todos = await repo.readAll()
    result[cfg.tabla] = todos
      .filter(r => !r.sincronizado)
      .map((row) => {
        const { sincronizado, ...rest } = row
        void sincronizado
        return rest
      })
  }
  result.deletes = await getPendingDeletes()
  return result
}
