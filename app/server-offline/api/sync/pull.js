/**
 * server-offline/sync/pull.js
 *
 * Aplica un resultado de pull (proveniente del server) a la DB local.
 * Para cada registro de cada tabla sincronizable, hace upsert (insert o update)
 * con sincronizado = 1.
 *
 * Espejo de la parte de aplicación de server/api/sync/pull.get.ts.
 */
import { ALL_ENTITIES } from '../../../../shared/entities/index.js'

const ENTIDADES_SYNC = ALL_ENTITIES.filter(e => e.sync)

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
  for (const entity of ENTIDADES_SYNC) {
    const tabla = entity.tabla
    const registros = pullResult[tabla]
    if (!registros?.length) continue
    const repo = useLocalRepo(entity)
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
