/**
 * api-offline/cuentas_fiado_items/list.js
 */
import { useDb } from '../../db-offline/client'

export async function list(opts, _auth) {
  void _auth
  const db = useDb()
  const all = await db.queryAll('cuentas_fiado_items')
  if (opts?.cuentaFiadoId) {
    return all.filter(i => i.cuentaFiadoId === opts.cuentaFiadoId)
  }
  return all
}
