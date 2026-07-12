/**
 * api-offline/sync/pull.js
 *
 * Aplica un resultado de pull (proveniente del server) a la DB local.
 * Para cada registro de cada tabla sincronizable, hace upsert (insert o update)
 * con sincronizado = 1.
 *
 * Espejo de la parte de aplicación de server/api/sync/pull.get.ts.
 */
import { ENTIDADES } from '~/config/entidades'

const TABLAS_SYNC = Object.entries(ENTIDADES)
  .filter(([, def]) => def.sync)
  .map(([tabla]) => tabla)

/**
 * @param {object} pullResult — { productos: [...], usuarios: [...], ... } o {} si no hay nada nuevo
 * @param {object} _opts — opciones (reservado)
 * @param {object} _auth
 * @returns {Promise<{aplicados: number}>}
 */
export async function pull(pullResult, _opts, _auth) {
  void _opts
  void _auth
  let aplicados = 0
  for (const tabla of TABLAS_SYNC) {
    const registros = pullResult[tabla]
    if (!registros?.length) continue
    const repo = useLocalRepo(tabla)
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
  return { aplicados }
}
