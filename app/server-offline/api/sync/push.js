/**
 * server-offline/sync/push.js
 *
 * Prepara el payload de push: reúne todos los registros con sincronizado = 0
 * de cada tabla sincronizable, listos para enviar al servidor.
 * El envío HTTP al server NO se hace aquí — eso es responsabilidad de useRemoteApi.
 *
 * Espejo de la parte de recolección de server/api/sync/push.post.ts.
 */
import { ALL_ENTITIES } from '../../../../shared/entities/index.js'

const ENTIDADES_SYNC = ALL_ENTITIES.filter(e => e.sync)

/**
 * @param {object} opts — opciones (reservado)
 * @param {object} auth
 * @returns {Promise<{[tabla: string]: object[]}>} mapa tabla → registros pendientes (sin campo sincronizado)
 */
export async function push(opts, auth) {
  void opts
  void auth
  const result = {}
  for (const entity of ENTIDADES_SYNC) {
    const tabla = entity.tabla
    const repo = useLocalRepo(entity)
    const todos = await repo.readAll()
    result[tabla] = todos
      .filter(r => !r.sincronizado)
      .map((row) => {
        const { sincronizado, ...rest } = row
        void sincronizado
        return rest
      })
  }
  return result
}
