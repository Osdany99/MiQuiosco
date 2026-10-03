/**
 * server/config/syncTables.ts — Re-exporta desde shared/tables.js.
 * La fuente única de verdad es shared/tables.js.
 */
import { SYNC_TABLES as _SYNC_TABLES } from '#shared/tables'

export interface SyncTable {
  tabla: string
  syncNumeric: string[]
  insertOnly: boolean
  puestoScoped: boolean
}

export const SYNC_TABLES: SyncTable[] = _SYNC_TABLES.map(t => ({
  tabla: t.tabla,
  syncNumeric: t.syncNumeric,
  insertOnly: t.insertOnly,
  puestoScoped: (t as { puestoScoped?: boolean }).puestoScoped === true
}))
