/**
 * server-offline/db/client.js — Capa de bajo nivel sobre SQLite (Capacitor) con fallback en memoria.
 *
 * En Android nativo: usa el plugin SQLite de Capacitor.
 * En navegador (dev): usa un fallback en memoria para poder desarrollar sin dispositivo.
 *
 * API expuesta: useDb() devuelve operaciones CRUD tipadas por tabla.
 * Las funciones de server-offline/* consumen esta capa.
 */
import { Capacitor } from '@capacitor/core'
import { deriveColumnTypes, coerceRow, deriveTableNames } from '../utils/schemaTypes'
import { deriveColumnMap, validateColumns } from '../utils/tablaColumnas'
import { snakeToCamelRow, camelToSnakeRow } from '../utils/normalize'
import * as schemaSqlite from './schema'
import ddlGenerado from '../../../drizzle/sqlite/0000_exotic_mentallo.sql?raw'
import { sembrarJefeLocal } from './seed'

const DB_NAME = 'miquiosco'

let dbConnection = null
let inMemoryDb = null

class InMemoryDb {
  tables = new Map()

  ensureTable(name) {
    if (!this.tables.has(name)) this.tables.set(name, [])
  }

  all(table) {
    return this.tables.get(table) ?? []
  }

  where(table, predicate) {
    return (this.tables.get(table) ?? []).filter(predicate)
  }

  insert(table, row) {
    if (!this.tables.has(table)) this.tables.set(table, [])
    this.tables.get(table).push(row)
  }

  update(table, predicate, patch) {
    const rows = this.tables.get(table) ?? []
    for (const row of rows) {
      if (predicate(row)) Object.assign(row, patch)
    }
  }

  getById(table, id) {
    const rows = this.tables.get(table) ?? []
    return rows.find(r => r.id === id) ?? null
  }

  remove(table, id) {
    const rows = this.tables.get(table) ?? []
    const idx = rows.findIndex(r => r.id === id)
    if (idx !== -1) rows.splice(idx, 1)
  }

  async run() {
    return Promise.resolve()
  }
}

async function getConnection() {
  if (Capacitor.isNativePlatform()) {
    if (!dbConnection) {
      const { CapacitorSQLite, SQLiteConnection } = await import('@capacitor-community/sqlite')
      const sqliteConnection = new SQLiteConnection(CapacitorSQLite)
      dbConnection = await sqliteConnection.createConnection(DB_NAME, false, 'no-encryption', 1, false)
      await dbConnection.open()
      await initializeSchema(dbConnection)
      await sembrarJefeLocal(dbConnection)
    }
    return dbConnection
  }

  if (!inMemoryDb) {
    inMemoryDb = new InMemoryDb()
    initializeSchemaMemory(inMemoryDb)
    await sembrarJefeLocal(inMemoryDb)
  }
  return inMemoryDb
}

async function initializeSchema(conn) {
  const result = await conn.query('SELECT name FROM sqlite_master WHERE type=\'table\' AND name=\'usuarios\'', [])
  if (result.values?.length > 0) return
  const ddl = ddlGenerado.replace(/--> statement-breakpoint/g, '')
  await conn.execute(ddl)
}

function initializeSchemaMemory(mem) {
  const tables = [
    'puestos', 'usuarios', 'productos', 'historial_precios',
    'cuadres', 'cuadre_items', 'productos_cache',
    'clientes', 'cuentas_fiado', 'cuentas_fiado_items', 'pagos_fiado'
  ]
  for (const t of tables) mem.ensureTable(t, '')
}

// =====================================================================
// Column type map derivado automáticamente del schema Drizzle
// =====================================================================

const COLUMN_TYPES = deriveColumnTypes(schemaSqlite)
const COLUMN_MAP = deriveColumnMap(schemaSqlite)

export { COLUMN_TYPES, COLUMN_MAP }

// =====================================================================
// API pública
// =====================================================================

/**
 * useDb() — Acceso de bajo nivel a SQLite.
 * Las funciones de server-offline/* usan esto en vez de duplicar la lógica.
 */
export function useDb() {
  async function getUsuarioPorNombreLocal(nombre) {
    const conn = await getConnection()
    if (conn instanceof InMemoryDb) {
      const rows = conn.where('usuarios', r => r.nombre === nombre)
      return rows.length > 0 ? coerceRow(snakeToCamelRow(rows[0]), COLUMN_TYPES.usuarios) : null
    }
    const result = await conn.query('SELECT * FROM usuarios WHERE nombre = ? LIMIT 1', [nombre])
    return result.values && result.values[0] ? coerceRow(snakeToCamelRow(result.values[0]), COLUMN_TYPES.usuarios) : null
  }

  async function getProductosActivos(puestoId) {
    const conn = await getConnection()
    if (conn instanceof InMemoryDb) {
      const rows = conn.where('productos', (r) => {
        const pid = r.puesto_id ?? r.puestoId
        return pid === puestoId && (r.activo === 1 || r.activo === true)
      })
      return rows.map(r => coerceRow(snakeToCamelRow(r), COLUMN_TYPES.productos))
    }
    const result = await conn.query('SELECT * FROM productos WHERE puesto_id = ? AND activo = 1 ORDER BY orden', [puestoId])
    return (result.values ?? []).map(r => coerceRow(snakeToCamelRow(r), COLUMN_TYPES.productos))
  }

  async function getCuadrePorFecha(puestoId, fecha) {
    const conn = await getConnection()
    if (conn instanceof InMemoryDb) {
      const rows = conn.where('cuadres', r => r.puesto_id === puestoId && r.fecha === fecha)
      return rows.length > 0 ? coerceRow(snakeToCamelRow(rows[0]), COLUMN_TYPES.cuadres) : null
    }
    const result = await conn.query('SELECT * FROM cuadres WHERE puesto_id = ? AND fecha = ? LIMIT 1', [puestoId, fecha])
    return result.values && result.values[0] ? coerceRow(snakeToCamelRow(result.values[0]), COLUMN_TYPES.cuadres) : null
  }

  async function getItemsDeCuadre(cuadreId) {
    const conn = await getConnection()
    if (conn instanceof InMemoryDb) {
      const rows = conn.where('cuadre_items', r => r.cuadre_id === cuadreId)
      return rows.map(r => coerceRow(snakeToCamelRow(r), COLUMN_TYPES['cuadre_items']))
    }
    const result = await conn.query('SELECT * FROM cuadre_items WHERE cuadre_id = ? ORDER BY creado_en', [cuadreId])
    return (result.values ?? []).map(r => coerceRow(snakeToCamelRow(r), COLUMN_TYPES['cuadre_items']))
  }

  async function insert(tabla, datos) {
    validateColumns(tabla, COLUMN_MAP, datos)
    const row = camelToSnakeRow(datos)
    const conn = await getConnection()
    if (conn instanceof InMemoryDb) {
      conn.ensureTable(tabla, '')
      conn.insert(tabla, { ...row })
      return datos
    }
    const keys = Object.keys(row)
    const placeholders = keys.map(() => '?').join(', ')
    const cols = keys.join(', ')
    await conn.run(`INSERT INTO ${tabla} (${cols}) VALUES (${placeholders})`, keys.map(k => row[k]))
    return datos
  }

  async function update(tabla, id, cambios) {
    validateColumns(tabla, COLUMN_MAP, cambios)
    const cambiosSnake = camelToSnakeRow(cambios)
    const conn = await getConnection()
    if (conn instanceof InMemoryDb) {
      const existing = conn.getById(tabla, id)
      if (existing) Object.assign(existing, cambiosSnake)
      return existing
    }
    const keys = Object.keys(cambiosSnake)
    const setClause = keys.map(k => `${k} = ?`).join(', ')
    await conn.run(`UPDATE ${tabla} SET ${setClause} WHERE id = ?`, [...keys.map(k => cambiosSnake[k]), id])
  }

  async function remove(tabla, id) {
    const conn = await getConnection()
    if (conn instanceof InMemoryDb) {
      conn.remove(tabla, id)
      return
    }
    await conn.run(`DELETE FROM ${tabla} WHERE id = ?`, [id])
  }

  async function queryAll(tabla) {
    const conn = await getConnection()
    if (conn instanceof InMemoryDb) {
      return conn.all(tabla).map(r => coerceRow(snakeToCamelRow(r), COLUMN_TYPES[tabla]))
    }
    const result = await conn.query(`SELECT * FROM ${tabla}`, [])
    return (result.values ?? []).map(r => coerceRow(snakeToCamelRow(r), COLUMN_TYPES[tabla]))
  }

  async function getById(tabla, id) {
    const conn = await getConnection()
    if (conn instanceof InMemoryDb) {
      const row = conn.getById(tabla, id)
      return row ? coerceRow(snakeToCamelRow(row), COLUMN_TYPES[tabla]) : null
    }
    const result = await conn.query(`SELECT * FROM ${tabla} WHERE id = ? LIMIT 1`, [id])
    return result.values && result.values[0]
      ? coerceRow(snakeToCamelRow(result.values[0]), COLUMN_TYPES[tabla])
      : null
  }

  async function queryWhere(tabla, whereSql, values) {
    const conn = await getConnection()
    if (conn instanceof InMemoryDb) {
      return conn.all(tabla).map(r => snakeToCamelRow(r))
    }
    const result = await conn.query(`SELECT * FROM ${tabla} WHERE ${whereSql}`, values ?? [])
    return (result.values ?? []).map(r => snakeToCamelRow(r))
  }

  async function resetLocalDatabase() {
    const conn = await getConnection()
    const tableNames = deriveTableNames(schemaSqlite)
    for (const t of tableNames) {
      try {
        await conn.run(`DROP TABLE IF EXISTS ${t}`, [])
      } catch {
        // ignore — la tabla puede no existir aún
      }
    }
    inMemoryDb = null
    dbConnection = null
  }

  return {
    getUsuarioPorNombreLocal,
    getProductosActivos,
    getCuadrePorFecha,
    getItemsDeCuadre,
    insert,
    update,
    remove,
    queryAll,
    getById,
    queryWhere,
    resetLocalDatabase
  }
}

// Para uso interno por seed y tests
export { getConnection, InMemoryDb }
