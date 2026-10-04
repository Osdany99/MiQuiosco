/**
 * server-offline/sync/push.js
 *
 * Prepara el payload de push: reúne todos los registros con sincronizado = 0
 * de cada tabla sincronizable, listos para enviar al servidor.
 * Incluye deletes pendientes.
 */
import { SYNC_TABLES } from '../../../../shared/tables'
import { getPendingDeletes } from '../_factory'
import { useDb } from '../../db/client'

const SYNC_TABLAS = SYNC_TABLES

export async function push(opts, auth) {
  void opts
  void auth
  const result = {}
  // pinHash vive en la BD cruda pero serialize lo quita para la UI: se
  // re-adjunta solo para el push, porque el servidor lo exige (NOT NULL) para
  // crear usuarios desde el dispositivo. Sin esto, un usuario creado en el
  // telefono revienta todo el push con un 500 opaco.
  let hashPorUsuario = null
  for (const cfg of SYNC_TABLAS) {
    const repo = useLocalRepo(cfg)
    const todos = await repo.readAll()
    let pendientes = todos
      .filter(r => !r.sincronizado)
      .map((row) => {
        const { sincronizado, ...rest } = row
        void sincronizado
        return rest
      })
    if (cfg.tabla === 'usuarios' && pendientes.length) {
      if (!hashPorUsuario) {
        const crudos = await useDb().queryAll('usuarios')
        hashPorUsuario = new Map(crudos.map(u => [u.id, u.pinHash]))
      }
      pendientes = pendientes.map(r => ({ ...r, pinHash: hashPorUsuario.get(r.id) ?? null }))
    }
    if (cfg.tabla === 'recargas' && pendientes.length) {
      // smsId es local (sms_etecsa no se sincroniza): mandarlo romperia la FK
      // en el servidor. Se quita en ambas cajas por si acaso.
      pendientes = pendientes.map((r) => {
        const copia = { ...r }
        delete copia.smsId
        delete copia.sms_id
        return copia
      })
    }
    result[cfg.tabla] = pendientes
  }
  result.deletes = await getPendingDeletes()
  return result
}
