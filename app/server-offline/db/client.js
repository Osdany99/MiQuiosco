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
import { deriveColumnTypes, coerceRow, deriveTableNames, deriveColumnDefs } from '../utils/schemaTypes'
import { deriveColumnMap, validateColumns } from '../utils/tablaColumnas'
import { snakeToCamelRow, camelToSnakeRow } from '../utils/normalize'
import { tablaExiste, crearTablasFaltantes, añadirColumnasFaltantes, crearIndicesFaltantes, crearColaTransacciones, txRun } from './esquema'
import * as schemaSqlite from './schema'
import { sembrarJefeLocal } from './seed'

const DB_NAME = 'miquiosco'

let dbConnection = null
let dbConnectionPromise = null
let inMemoryDb = null
let inMemoryDbPromise = null

// La cola es compartida a nivel módulo: como useDb() se instancia en cada
// componente, una cola local por instancia no alcanzaría para serializar
// transacciones entre consumidores distintos.
const colaTransacciones = crearColaTransacciones()

// Indica si el hilo actual de ejecución está dentro de nuestra transacción
// manual. Las escrituras internas deben viajar con transaction:false para que
// el plugin no las auto-confirme por separado (ver txRun en ./esquema).
// La cola garantiza que nunca haya dos transacciones solapadas, así que un
// boolean a nivel módulo es suficiente.
let transaccionActiva = false

async function runEscritura(conn, sql, params) {
  if (transaccionActiva) return txRun(conn, sql, params)
  return conn.run(sql, params)
}

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

  snapshot() {
    const snap = new Map()
    for (const [k, v] of this.tables) {
      snap.set(k, v.map(r => ({ ...r })))
    }
    return snap
  }

  restore(snap) {
    this.tables = snap
  }

  async run() {
    return Promise.resolve()
  }
}

async function getConnection() {
  if (Capacitor.isNativePlatform()) {
    if (!dbConnection) {
      if (!dbConnectionPromise) {
        dbConnectionPromise = (async () => {
          const { CapacitorSQLite, SQLiteConnection } = await import('@capacitor-community/sqlite')
          const sqliteConnection = new SQLiteConnection(CapacitorSQLite)
          dbConnection = await sqliteConnection.createConnection(DB_NAME, false, 'no-encryption', 1, false)
          await dbConnection.open()
          await initializeSchema(dbConnection)
          await sembrarJefeLocal(dbConnection)
        })()
      }
      await dbConnectionPromise
    }
    return dbConnection
  }

  if (!inMemoryDb) {
    if (!inMemoryDbPromise) {
      inMemoryDbPromise = (async () => {
        inMemoryDb = new InMemoryDb()
        initializeSchemaMemory(inMemoryDb)
        await sembrarJefeLocal(inMemoryDb)
      })()
    }
    await inMemoryDbPromise
  }
  return inMemoryDb
}

/**
 * Migraciones del journal de Drizzle (drizzle/sqlite/*.sql), cargadas en orden.
 * Hoy el journal es un único baseline inicial (0000_*.sql) generado desde
 * app/server-offline/db/schema.ts. Las instalaciones existentes NO se actualizan
 * re-ejecutando el baseline: se reconcilian contra el schema (ver reconcileSchema).
 */
const journalSqls = Object.entries(
  import.meta.glob('../../../drizzle/sqlite/*.sql', { query: '?raw', import: 'default', eager: true })
).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))

// OJO: el separador incluye un statement-breakpoint explícito. Sin él, la
// última sentencia de un archivo quedaría fundida con la primera del
// siguiente al separar, y crearTablasFaltantes/crearIndicesFaltantes
// clasificarían mal el bloque (un CREATE TABLE pegado tras un CREATE INDEX
// nunca se crearía en instalaciones existentes).
const BASELINE_SQL = journalSqls.map(([, sql]) => sql).join('\n--> statement-breakpoint\n')

/**
 * Migraciones legacy best-effort para instalaciones creadas antes del sistema
 * de journal. Columnas añadidas ad-hoc + índices/datos idempotentes.
 * Se aplican SOLO a instalaciones existentes, antes del journal.
 */
const MIGRACIONES_LEGACY = [
  { type: 'column', table: 'usuarios', name: 'telefono', sql: 'ALTER TABLE usuarios ADD COLUMN telefono text' },
  { type: 'column', table: 'usuarios', name: 'notas', sql: 'ALTER TABLE usuarios ADD COLUMN notas text' },
  { type: 'data', sql: 'UPDATE cuadres SET monto_cobrado_fiado = 0 WHERE monto_cobrado_fiado IS NULL' },
  { type: 'index', sql: 'CREATE INDEX IF NOT EXISTS usuarios_activo_idx ON usuarios (activo)' },
  { type: 'index', sql: 'CREATE INDEX IF NOT EXISTS productos_activo_idx ON productos (activo)' },
  { type: 'index', sql: 'CREATE INDEX IF NOT EXISTS historial_precios_vigente_idx ON historial_precios (producto_id, vigente_hasta)' },
  { type: 'index', sql: 'CREATE INDEX IF NOT EXISTS cuadres_jefe_idx ON cuadres (jefe_id)' },
  { type: 'index', sql: 'CREATE INDEX IF NOT EXISTS cuentas_fiado_cuadre_origen_idx ON cuentas_fiado (cuadre_origen_id)' },
  { type: 'index', sql: 'CREATE INDEX IF NOT EXISTS cuentas_fiado_items_producto_idx ON cuentas_fiado_items (producto_id)' }
]

/** Nombre del baseline actual del journal, generado desde schema.ts. */
const NOMBRE_BASELINE = journalSqls.length > 0 ? journalSqls[0][0] : '0000_inicial.sql'

async function marcarMigracion(conn, name) {
  await conn.run('INSERT OR REPLACE INTO _migrations (name, aplicada_en) VALUES (?, ?)', [name, Date.now()])
}

async function aplicarMigracionesLegacy(conn) {
  const colCache = new Map()
  for (const m of MIGRACIONES_LEGACY) {
    try {
      if (m.type === 'column') {
        if (!colCache.has(m.table)) {
          const cols = await conn.query(`PRAGMA table_info(${m.table})`, [])
          colCache.set(m.table, new Set((cols.values ?? []).map(c => c.name)))
        }
        if (!colCache.get(m.table).has(m.name)) {
          await conn.run(m.sql, [])
        }
      } else {
        await conn.run(m.sql, [])
      }
    } catch {
      // mejor esfuerzo: instalaciones muy antiguas pueden no tener la tabla/columna
    }
  }
}

/**
 * Reconciliación idempotente de una instalación existente contra el schema actual:
 * - Crea tablas que faltan (CREATE TABLE IF NOT EXISTS).
 * - Añade columnas que faltan en tablas existentes (ALTER TABLE ADD COLUMN).
 * - Crea índices que faltan (CREATE [UNIQUE] INDEX IF NOT EXISTS).
 * Nunca borra ni modifica filas: los datos de la instalación se preservan.
 * La lógica pura vive en ./esquema para poder testearla en node.
 */
async function initializeSchema(conn) {
  await conn.run('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, aplicada_en INTEGER NOT NULL)', [])

  const esInstalacionExistente = await tablaExiste(conn, 'usuarios')

  if (!esInstalacionExistente) {
    // Instalación nueva: crear todo el esquema desde el baseline.
    await conn.execute(BASELINE_SQL.replace(/--> statement-breakpoint/g, ''))
    await marcarMigracion(conn, NOMBRE_BASELINE)
    return
  }

  // Instalación existente: reconciliación idempotente contra schema.ts.
  await aplicarMigracionesLegacy(conn)
  await marcarMigracion(conn, NOMBRE_BASELINE)
  await crearTablasFaltantes(conn, BASELINE_SQL)
  await añadirColumnasFaltantes(conn, COLUMN_DEFS)
  await crearIndicesFaltantes(conn, BASELINE_SQL)
}

function initializeSchemaMemory(mem) {
  const tables = [
    'puestos', 'usuarios', 'productos', 'historial_precios',
    'cuadres', 'cuadre_items', 'productos_cache',
    'cuentas_fiado', 'cuentas_fiado_items', 'pagos_fiado',
    'transferencias', 'transferencia_items', 'ajustes',
    'proveedores', 'lotes', 'traspasos', 'movimientos_inventario'
  ]
  for (const t of tables) mem.ensureTable(t, '')
}

// =====================================================================
// Column type map derivado automáticamente del schema Drizzle
// =====================================================================

const COLUMN_TYPES = deriveColumnTypes(schemaSqlite)
const COLUMN_MAP = deriveColumnMap(schemaSqlite)
const COLUMN_DEFS = deriveColumnDefs(schemaSqlite)

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
      rows.sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
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
    await runEscritura(conn, `INSERT INTO ${tabla} (${cols}) VALUES (${placeholders})`, keys.map(k => row[k]))
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
    await runEscritura(conn, `UPDATE ${tabla} SET ${setClause} WHERE id = ?`, [...keys.map(k => cambiosSnake[k]), id])
  }

  async function remove(tabla, id) {
    const conn = await getConnection()
    if (conn instanceof InMemoryDb) {
      conn.remove(tabla, id)
      return
    }
    await runEscritura(conn, `DELETE FROM ${tabla} WHERE id = ?`, [id])
  }

  async function findHistorialVigente(productoId) {
    const conn = await getConnection()
    if (conn instanceof InMemoryDb) {
      const rows = conn.where('historial_precios', r => (r.producto_id ?? r.productoId) === productoId && (r.vigente_hasta ?? r.vigenteHasta) == null)
      return rows.length ? coerceRow(snakeToCamelRow(rows[0]), COLUMN_TYPES.historial_precios) : null
    }
    const result = await conn.query('SELECT * FROM historial_precios WHERE producto_id = ? AND vigente_hasta IS NULL LIMIT 1', [productoId])
    return result.values && result.values[0] ? coerceRow(snakeToCamelRow(result.values[0]), COLUMN_TYPES.historial_precios) : null
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

  async function resetLocalDatabase() {
    const conn = await getConnection()
    const tableNames = [...deriveTableNames(schemaSqlite), '_migrations']
    for (const t of tableNames) {
      try {
        await conn.run(`DROP TABLE IF EXISTS ${t}`, [])
      } catch {
        // ignore — la tabla puede no existir aún
      }
    }
    inMemoryDb = null
    inMemoryDbPromise = null
    dbConnection = null
    dbConnectionPromise = null
  }

  // La cola colaTransacciones es compartida a nivel módulo: como useDb() se
  // instancia en cada componente, una cola local por instancia no alcanzaría
  // para serializar transacciones entre consumidores distintos.
  async function transaction(fn) {
    const conn = await getConnection()
    if (conn instanceof InMemoryDb) {
      const snap = conn.snapshot()
      try {
        return await fn({ insert, update, remove })
      } catch (err) {
        conn.restore(snap)
        throw err
      }
    }
    return colaTransacciones.ejecutar(conn, async (ops) => {
      transaccionActiva = true
      try {
        return await fn(ops)
      } finally {
        transaccionActiva = false
      }
    }, { insert, update, remove })
  }

  return {
    getUsuarioPorNombreLocal,
    getProductosActivos,
    getCuadrePorFecha,
    getItemsDeCuadre,
    findHistorialVigente,
    insert,
    update,
    remove,
    queryAll,
    getById,
    resetLocalDatabase,
    transaction
  }
}

// Para uso interno por seed y tests
export { getConnection, InMemoryDb }
