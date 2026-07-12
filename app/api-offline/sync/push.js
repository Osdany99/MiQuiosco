/**
 * api-offline/sync/push.js
 *
 * Prepara el payload de push: reúne todos los registros con sincronizado = 0
 * de cada tabla sincronizable, listos para enviar al servidor.
 * El envío HTTP al server NO se hace aquí — eso es responsabilidad de useRemoteApi.
 *
 * Espejo de la parte de recolección de server/api/sync/push.post.ts.
 */
import { ENTIDADES } from '~/config/entidades'

const TABLAS_SYNC = Object.entries(ENTIDADES)
  .filter(([, def]) => def.sync)
  .map(([tabla]) => tabla)

/**
 * @param {object} opts — opciones (reservado)
 * @param {object} auth
 * @returns {Promise<{[tabla: string]: object[]}>} mapa tabla → registros pendientes (sin campo sincronizado)
 */
export async function push(opts, auth) {
  void opts
  void auth
  const result = {}
  for (const tabla of TABLAS_SYNC) {
    const repo = useLocalRepo(tabla)
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
