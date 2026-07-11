import { Capacitor } from '@capacitor/core'
import bcrypt from 'bcryptjs'
import { JEFE_ID_FIJO, PUESTO_PRINCIPAL_ID_FIJO } from '../../shared/constants'
import ddlGenerado from '../../drizzle/sqlite/0000_exotic_mentallo.sql?raw'
import * as schemaSqlite from '../../shared/schema-sqlite'
import { deriveColumnTypes, coerceRow, deriveTableNames } from '../utils/schemaTypes'
import { deriveColumnMap, validateColumns } from '../utils/tablaColumnas'

/**
 * Wrapper sobre @capacitor-community/sqlite.
 *
 * En Android nativo: usa el plugin SQLite de Capacitor.
 * En navegador (dev): usa un fallback en memoria para poder desarrollar
 * sin dispositivo. Esto permite probar la app en el browser del dev server
 * aunque la funcionalidad offline real solo aplique en producción.
 *
 * API expuesta: funciones para cada tabla principal.
 * Cada función hace una query simple y devuelve filas.
 */

/**
 * useLocalDb - Composable para acceso a base de datos SQLite local (Capacitor) con fallback en memoria.
 * Provee métodos CRUD tipados para las tablas principales de la app (puestos, usuarios, productos, cuadres, etc.).
 *
 * @returns {Object} API de base de datos local:
 * @returns {Function} returns.getUsuarioPorNombreLocal - Busca usuario por nombre (login offline): (nombre) => Promise<Usuario|null>.
 * @returns {Function} returns.getProductosActivos - Lista productos activos de un puesto: (puestoId) => Promise<Producto[]>.
 * @returns {Function} returns.getCuadrePorFecha - Obtiene cuadre del día para un puesto: (puestoId, fecha) => Promise<Cuadre|null>.
 * @returns {Function} returns.getItemsDeCuadre - Obtiene líneas de un cuadre: (cuadreId) => Promise<CuadreItem[]>.
 *
 * @example
 * const { getUsuarioPorNombreLocal, getProductosActivos, getCuadrePorFecha, getItemsDeCuadre } = useLocalDb()
 *
 * // Login offline
 * const usuario = await getUsuarioPorNombreLocal('trabajador1')
 *
 * // Productos para cuadre
 * const productos = await getProductosActivos('puesto-123')
 *
 * // Cuadre del día
 * const cuadre = await getCuadrePorFecha('puesto-123', '2024-01-15')
 * const items = await getItemsDeCuadre(cuadre.id)
 */

const DB_NAME = 'miquiosco'

let dbConnection = null
let inMemoryDb = null

class InMemoryDb {
  tables = new Map()

  ensureTable(name, schema) {
    if (!this.tables.has(name)) {
      this.tables.set(name, [])
      // El schema se ignora en este fallback: las inserciones son crudas
      void schema
    }
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

  run(_sql, _params) {
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

async function sembrarJefeLocal(conn) {
  const ahora = Date.now()

  if (conn instanceof InMemoryDb) {
    const usuarios = conn.all('usuarios')
    if (usuarios.length > 0) return

    const puesto = conn.getById('puestos', PUESTO_PRINCIPAL_ID_FIJO)
    if (!puesto) {
      conn.insert('puestos', {
        id: PUESTO_PRINCIPAL_ID_FIJO,
        nombre: 'Puesto principal',
        activo: 1,
        creado_en: ahora
      })
    }

    conn.insert('usuarios', {
      id: JEFE_ID_FIJO,
      puesto_id: PUESTO_PRINCIPAL_ID_FIJO,
      nombre: 'jefe',
      rol: 'jefe',
      pin_hash: bcrypt.hashSync('1234', 10),
      activo: 1,
      salario: 600,
      creado_en: ahora,
      actualizado_en: ahora,
      sincronizado: 0
    })
    return
  }

  // SQLite nativo (Capacitor)
  const countResult = await conn.query('SELECT COUNT(*) AS cnt FROM usuarios', [])
  const count = countResult.values?.[0]?.cnt ?? 0
  if (count > 0) return

  const puestoResult = await conn.query('SELECT id FROM puestos WHERE id = ? LIMIT 1', [PUESTO_PRINCIPAL_ID_FIJO])
  if (!puestoResult.values?.[0]) {
    await conn.run(
      'INSERT INTO puestos (id, nombre, activo, creado_en) VALUES (?, ?, 1, ?)',
      [PUESTO_PRINCIPAL_ID_FIJO, 'Puesto principal', ahora]
    )
  }

  const pinHash = bcrypt.hashSync('1234', 10)
  await conn.run(
    `INSERT INTO usuarios (id, puesto_id, nombre, rol, pin_hash, activo, salario, creado_en, actualizado_en, sincronizado)
     VALUES (?, ?, ?, ?, ?, 1, 600, ?, ?, 0)`,
    [JEFE_ID_FIJO, PUESTO_PRINCIPAL_ID_FIJO, 'jefe', 'jefe', pinHash, ahora, ahora]
  )
}

// =====================================================================
// Column type map derivado automáticamente del schema Drizzle
// =====================================================================

const COLUMN_TYPES = deriveColumnTypes(schemaSqlite)
const COLUMN_MAP = deriveColumnMap(schemaSqlite)

// =====================================================================
// API pública del composable
// =====================================================================

export function useLocalDb() {
  /**
   * Busca un usuario local por nombre (para login offline).
   */
  async function getUsuarioPorNombreLocal(nombre) {
    const conn = await getConnection()

    if (conn instanceof InMemoryDb) {
      const rows = conn.where('usuarios', r => r.nombre === nombre)
      return rows.length > 0 ? coerceRow(snakeToCamelRow(rows[0]), COLUMN_TYPES.usuarios) : null
    }
    const result = await conn.query('SELECT * FROM usuarios WHERE nombre = ? LIMIT 1', [nombre])
    return result.values && result.values[0] ? coerceRow(snakeToCamelRow(result.values[0]), COLUMN_TYPES.usuarios) : null
  }

  /**
   * Lista los productos activos para el cuadre.
   */
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

  /**
   * Obtiene el cuadre del día para un puesto, si existe.
   */
  async function getCuadrePorFecha(puestoId, fecha) {
    const conn = await getConnection()

    if (conn instanceof InMemoryDb) {
      const rows = conn.where('cuadres', r => r.puesto_id === puestoId && r.fecha === fecha)
      return rows.length > 0 ? coerceRow(snakeToCamelRow(rows[0]), COLUMN_TYPES.cuadres) : null
    }

    const result = await conn.query('SELECT * FROM cuadres WHERE puesto_id = ? AND fecha = ? LIMIT 1', [puestoId, fecha])
    return result.values && result.values[0] ? coerceRow(snakeToCamelRow(result.values[0]), COLUMN_TYPES.cuadres) : null
  }

  /**
   * Obtiene las líneas de un cuadre.
   */
  async function getItemsDeCuadre(cuadreId) {
    const conn = await getConnection()

    if (conn instanceof InMemoryDb) {
      const rows = conn.where('cuadre_items', r => r.cuadre_id === cuadreId)
      return rows.map(r => coerceRow(snakeToCamelRow(r), COLUMN_TYPES['cuadre_items']))
    }

    const result = await conn.query('SELECT * FROM cuadre_items WHERE cuadre_id = ? ORDER BY creado_en', [cuadreId])
    return (result.values ?? []).map(r => coerceRow(snakeToCamelRow(r), COLUMN_TYPES['cuadre_items']))
  }

  /**
   * Inserta una fila en la tabla indicada.
   * Los keys del objeto datos se usan como nombres de columna (snake_case).
   */
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

  /**
   * Actualiza una fila por su campo `id`.
   */
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

  /**
   * Elimina una fila por su campo `id`.
   */
  async function remove(tabla, id) {
    const conn = await getConnection()

    if (conn instanceof InMemoryDb) {
      conn.remove(tabla, id)
      return
    }

    await conn.run(`DELETE FROM ${tabla} WHERE id = ?`, [id])
  }

  /**
   * Retorna todas las filas de una tabla.
   */
  async function queryAll(tabla) {
    const conn = await getConnection()

    if (conn instanceof InMemoryDb) {
      return conn.all(tabla).map(r => coerceRow(snakeToCamelRow(r), COLUMN_TYPES[tabla]))
    }

    const result = await conn.query(`SELECT * FROM ${tabla}`, [])
    return (result.values ?? []).map(r => coerceRow(snakeToCamelRow(r), COLUMN_TYPES[tabla]))
  }

  /**
   * Retorna una fila por su campo `id`, o null si no existe.
   */
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

  /**
   * Retorna filas que cumplen el predicado.
   * En SQLite nativo se pasa WHERE crudo (ej. "puesto_id = ? AND activo = 1") con sus valores.
   */
  async function queryWhere(tabla, whereSql, values) {
    const conn = await getConnection()

    if (conn instanceof InMemoryDb) {
      return conn.all(tabla).map(r => snakeToCamelRow(r))
    }

    const result = await conn.query(`SELECT * FROM ${tabla} WHERE ${whereSql}`, values ?? [])
    return (result.values ?? []).map(r => snakeToCamelRow(r))
  }

  /**
   * Resetea la base de datos local: elimina todas las tablas y las recrea.
   * Útil durante desarrollo para partir de un estado limpio.
   */
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
