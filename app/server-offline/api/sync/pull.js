/**
 * server-offline/sync/pull.js
 *
 * Aplica un resultado de pull (proveniente del server) a la DB local.
 * Incluye aplicación de deletes recibidos del servidor.
 *
 * Se aplica por lotes dentro de una transacción: con miles de filas, una
 * escritura suelta por fila tarda minutos en Android. Si un lote falla, se
 * deshace entero y el watermark no avanza, así que el siguiente intento
 * reaplica sin duplicar (upsert por id).
 */
import { SYNC_TABLES } from '../../../../shared/tables'
import { calcularHashFila } from '../../../utils/hashFila'
import { removePendingDeletesAccepted, enrichForInsert, enrichForSync, registrarSyncConflictos } from '../_factory'
import { useDb } from '../../db/client'
import { Preferences } from '@capacitor/preferences'

const SYNC_TABLAS = SYNC_TABLES
/** Filas por transacción de aplicación. */
const LOTE_APLICACION = 200

/**
 * @param {Map<string, number>} existentes id → sincronizado, precargado por
 * tabla. Sin esto cada fila hacía su propio `getById` (una consulta más por
 * fila, miles en un pull grande).
 */
async function upsertRegistro(cfg, reg, existentes) {
  const db = useDb()
  if (existentes.has(reg.id)) {
    const local = existentes.get(reg.id)
    const localSync = typeof local === 'object' && local !== null ? local.sincronizado : local
    // No pisar ediciones locales aún no subidas (sincronizado = 0):
    // se resuelven vía push / conflicto, donde el timestamp decide.
    // Sin esto, un pull tras el login borra cambios locales pendientes.
    if (!localSync) return false
    // Drift temprano: si la fila está marcada como sincronizada pero el
    // contenido ya difiere del servidor, se registra como conflicto para que
    // el centro de conflictos (Fase 11) lo muestre. Se absorbe el servidor.
    try {
      const lh = await calcularHashFila(local)
      const sh = await calcularHashFila(reg)
      if (lh && sh && lh !== sh) {
        void registrarSyncConflictos([{
          tabla: cfg.tabla,
          id: reg.id,
          servidorHash: sh,
          clienteHash: lh
        }])
      }
    } catch { /* best-effort */ }
    // enrichForSync, no enrichForUpdate: lo que llega es del servidor, así que
    // se respetan su actualizadoEn y queda marcada como sincronizada.
    await db.update(cfg.tabla, reg.id, enrichForSync(cfg.tabla, { ...reg, sincronizado: 1 }))
    try {
      const ts = reg.actualizadoEn ? new Date(reg.actualizadoEn).getTime() : 0
      if (ts) await Preferences.set({ key: `sync_base:${cfg.tabla}:${reg.id}`, value: String(ts) })
      // instantánea base para el 3-way merge de Fase 10
      await Preferences.set({ key: `sync_base_val:${cfg.tabla}:${reg.id}`, value: JSON.stringify(reg) })
    } catch {}
    existentes.set(reg.id, { ...local, sincronizado: 1 })
    return true
  }
  await db.insert(cfg.tabla, enrichForInsert(cfg.tabla, { ...reg, sincronizado: 1 }))
  try {
    const ts = reg.actualizadoEn ? new Date(reg.actualizadoEn).getTime() : 0
    if (ts) await Preferences.set({ key: `sync_base:${cfg.tabla}:${reg.id}`, value: String(ts) })
    await Preferences.set({ key: `sync_base_val:${cfg.tabla}:${reg.id}`, value: JSON.stringify(reg) })
  } catch {}
  existentes.set(reg.id, { ...reg, sincronizado: 1 })
  return true
}

export async function pull(pullResult, _opts, _auth) {
  const signal = _opts?.signal
  const onProgress = _opts?.onProgress
  void _auth
  const db = useDb()
  let aplicados = 0
  let deletesAplicados = 0
  let procesados = 0

  for (const cfg of SYNC_TABLAS) {
    const registros = pullResult[cfg.tabla]
    if (!registros?.length) continue

    // Una sola lectura por tabla (id + sincronizado) en vez de un getById por fila.
    const filasLocales = await db.queryAll(cfg.tabla)
    const existentes = new Map(filasLocales.map(r => [r.id, r]))

    for (let i = 0; i < registros.length; i += LOTE_APLICACION) {
      const trozo = registros.slice(i, i + LOTE_APLICACION)
      await db.transaction(async () => {
        for (const reg of trozo) {
          signal?.throwIfAborted?.()
          if (await upsertRegistro(cfg, reg, existentes)) aplicados++
          procesados++
        }
      })
      onProgress?.(procesados)
    }
  }

  const deletes = pullResult.deletes ?? []
  // Los repos se resuelven FUERA de la transacción: cada `useLocalRepo()` crea
  // un repo que consulta el contexto de Nuxt/auth, y no debe ejecutarse dentro
  // del callback transaccional.
  const reposDelete = new Map(
    deletes.map(del => [del.tabla, SYNC_TABLAS.find(t => t.tabla === del.tabla)])
      .filter(([, cfg]) => !!cfg)
      .map(([tabla, cfg]) => [tabla, useLocalRepo(cfg)])
  )

  for (let i = 0; i < deletes.length; i += LOTE_APLICACION) {
    const trozo = deletes.slice(i, i + LOTE_APLICACION)
    await db.transaction(async () => {
      for (const del of trozo) {
        signal?.throwIfAborted?.()
        const repo = reposDelete.get(del.tabla)
        if (repo) {
          try {
            await repo.remove(del.id)
            deletesAplicados++
          } catch {
            // registro ya no existe localmente
          }
        }
        procesados++
      }
    })
    onProgress?.(procesados)
  }

  if (deletes.length > 0) {
    await removePendingDeletesAccepted(deletes)
  }

  return { aplicados, deletesAplicados, procesados }
}
