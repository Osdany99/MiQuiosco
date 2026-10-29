/**
 * server-offline/sync/push.js
 *
 * Prepara el payload de push: reúne todos los registros con sincronizado = 0
 * de cada tabla sincronizable, listos para enviar al servidor.
 * Incluye deletes pendientes.
 *
 * Se lee con `queryAll` (filas crudas) y NO con `useLocalRepo().readAll()`:
 * `readAll` pasa por la lista de la UI, que aplica `serialize` y `listFilter`.
 * Eso dejaba filas pendientes para siempre — `serializarUsuario` descarta
 * `sincronizado`, así que todos los usuarios se reenviaban en cada sync, y los
 * clientes fusionados quedaban excluidos del push. Además evita leer y
 * convertir dos veces las mismas filas.
 */
import { SYNC_TABLES } from '../../../../shared/tables'
import { getPendingDeletes } from '../_factory'
import { useDb } from '../../db/client'

/**
 * Filtra las filas que el servidor rechazaría por pertenecer a otro puesto.
 * Con `repo.readAll()` esto lo hacía `queryFromDb`; al leer crudo hay que
 * hacerlo aquí, porque un solo id ajeno aborta el lote entero con 403.
 */
function filtrarPorPuesto(rows, cfg, puestoId) {
  if (!cfg.puestoScoped || !puestoId) return rows
  return rows.filter(r => !r.puestoId || r.puestoId === puestoId)
}

export async function push(opts, auth) {
  void opts
  const db = useDb()
  const authActual = auth?.usuarioActual ? auth : (typeof useAuth === 'function' ? useAuth() : null)
  const puestoId = authActual?.usuarioActual?.value?.puestoId ?? null
  const result = {}

  for (const cfg of SYNC_TABLES) {
    const todas = await db.queryAll(cfg.tabla)
    let pendientes = filtrarPorPuesto(todas, cfg, puestoId)
      .filter(r => !r.sincronizado)
      .map((row) => {
        const { sincronizado, ...rest } = row
        void sincronizado
        return rest
      })

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
    // `usuarios` ya viaja con pinHash (columna real de sqlite): el servidor lo
    // exige (NOT NULL) para crear usuarios desde el dispositivo.
    result[cfg.tabla] = pendientes
  }
  result.deletes = await getPendingDeletes()
  return result
}
