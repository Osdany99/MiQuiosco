/**
 * api-offline/pagos_fiado/list.js
 */
import { useDb } from '../../db-offline/client'

export async function list(opts, _auth) {
  void _auth
  const db = useDb()
  const all = await db.queryAll('pagos_fiado')
  if (opts?.cuentaFiadoId) {
    return all.filter(p => p.cuentaFiadoId === opts.cuentaFiadoId)
  }
  if (opts?.cuadreId) {
    return all.filter(p => p.cuadreId === opts.cuadreId)
  }
  return all
}
