import { Capacitor } from '@capacitor/core'

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
}

async function getConnection() {
  if (Capacitor.isNativePlatform()) {
    if (!dbConnection) {
      const sqlite = (await import('@capacitor-community/sqlite')).default
      dbConnection = await sqlite.createConnection({
        database: DB_NAME,
        encrypted: false,
        mode: 'no-encryption'
      })
      await dbConnection.open()
      await initializeSchema(dbConnection)
    }
    return dbConnection
  }

  if (!inMemoryDb) {
    inMemoryDb = new InMemoryDb()
    initializeSchemaMemory(inMemoryDb)
  }
  return inMemoryDb
}

async function initializeSchema(conn) {
  await conn.execute({
    statements: `
      CREATE TABLE IF NOT EXISTS puestos (
        id TEXT PRIMARY KEY, nombre TEXT NOT NULL,
        activo INTEGER NOT NULL DEFAULT 1, creado_en INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS usuarios (
        id TEXT PRIMARY KEY, puesto_id TEXT NOT NULL, nombre TEXT NOT NULL,
        rol TEXT NOT NULL, pin_hash TEXT NOT NULL,
        activo INTEGER NOT NULL DEFAULT 1, debe_cambiar_pin INTEGER NOT NULL DEFAULT 0,
        creado_en INTEGER NOT NULL, actualizado_en INTEGER NOT NULL,
        sincronizado INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS productos (
        id TEXT PRIMARY KEY, puesto_id TEXT NOT NULL, nombre TEXT NOT NULL,
        descripcion TEXT, activo INTEGER NOT NULL DEFAULT 1, orden INTEGER NOT NULL DEFAULT 0,
        precio_compra_actual REAL NOT NULL DEFAULT 0,
        precio_venta_actual REAL NOT NULL DEFAULT 0,
        creado_en INTEGER NOT NULL, actualizado_en INTEGER NOT NULL,
        sincronizado INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS historial_precios (
        id TEXT PRIMARY KEY, producto_id TEXT NOT NULL,
        precio_compra REAL NOT NULL, precio_venta REAL NOT NULL,
        vigente_desde INTEGER NOT NULL, vigente_hasta INTEGER,
        cambiado_por TEXT, creado_en INTEGER NOT NULL,
        actualizado_en INTEGER NOT NULL, sincronizado INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS cuadres (
        id TEXT PRIMARY KEY, puesto_id TEXT NOT NULL, fecha TEXT NOT NULL,
        jefe_id TEXT NOT NULL, trabajador_turno_id TEXT,
        pago_trabajador REAL, total_esperado REAL NOT NULL DEFAULT 0,
        total_real_caja REAL, monto_transferencia REAL NOT NULL DEFAULT 0,
        monto_fiado REAL NOT NULL DEFAULT 0, diferencia REAL,
        estado TEXT NOT NULL DEFAULT 'abierto', notas TEXT,
        cerrado_en INTEGER, reabierto_veces INTEGER NOT NULL DEFAULT 0,
        ultima_reapertura_en INTEGER,
        creado_en INTEGER NOT NULL, actualizado_en INTEGER NOT NULL,
        sincronizado INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS cuadre_items (
        id TEXT PRIMARY KEY, cuadre_id TEXT NOT NULL, producto_id TEXT NOT NULL,
        precio_venta_usado REAL NOT NULL, cantidad REAL NOT NULL DEFAULT 0,
        subtotal REAL NOT NULL DEFAULT 0,
        tipo_linea TEXT NOT NULL DEFAULT 'normal', nota TEXT,
        es_extra INTEGER NOT NULL DEFAULT 0,
        creado_en INTEGER NOT NULL, actualizado_en INTEGER NOT NULL,
        sincronizado INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS productos_cache (
        id TEXT PRIMARY KEY, nombre TEXT NOT NULL,
        precio_venta_actual REAL NOT NULL, orden INTEGER NOT NULL DEFAULT 0,
        descargado_en INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS registro_trabajador (
        id TEXT PRIMARY KEY, fecha TEXT NOT NULL, trabajador_id TEXT NOT NULL,
        exportado INTEGER NOT NULL DEFAULT 0, exportado_en INTEGER,
        creado_en INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS registro_trabajador_items (
        id TEXT PRIMARY KEY, registro_id TEXT NOT NULL, producto_id TEXT NOT NULL,
        cantidad REAL NOT NULL DEFAULT 0, precio_anotado REAL NOT NULL DEFAULT 0,
        creado_en INTEGER NOT NULL
      );
    `
  })
}

function initializeSchemaMemory(mem) {
  const tables = [
    'puestos', 'usuarios', 'productos', 'historial_precios',
    'cuadres', 'cuadre_items', 'productos_cache',
    'registro_trabajador', 'registro_trabajador_items'
  ]
  for (const t of tables) mem.ensureTable(t, '')
}

// =====================================================================
// Column type map y coerceRow — reemplaza los 4 mappers específicos
// =====================================================================

const COLUMN_TYPES = {
  usuarios: {
    id: 'String',
    puestoId: 'String',
    nombre: 'String',
    rol: 'String',
    pinHash: 'String',
    activo: 'Boolean',
    debeCambiarPin: 'Boolean',
    creadoEn: 'Number',
    actualizadoEn: 'Number'
  },
  productos: {
    id: 'String',
    puestoId: 'String',
    nombre: 'String',
    descripcion: 'passthrough',
    activo: 'Boolean',
    orden: 'Number',
    precioCompraActual: 'Number',
    precioVentaActual: 'Number',
    creadoEn: 'Number',
    actualizadoEn: 'Number',
    sincronizado: 'Number'
  },
  cuadres: {
    id: 'String',
    puestoId: 'String',
    fecha: 'String',
    jefeId: 'String',
    trabajadorTurnoId: 'nullableNumber',
    pagoTrabajador: 'nullableNumber',
    totalEsperado: 'Number',
    totalRealCaja: 'nullableNumber',
    montoTransferencia: 'Number',
    montoFiado: 'Number',
    diferencia: 'nullableNumber',
    estado: 'String',
    notas: 'passthrough',
    cerradoEn: 'nullableNumber',
    reabiertoVeces: 'Number',
    ultimaReaperturaEn: 'nullableNumber',
    creadoEn: 'Number',
    actualizadoEn: 'Number',
    sincronizado: 'Number'
  },
  cuadre_items: {
    id: 'String',
    cuadreId: 'String',
    productoId: 'String',
    precioVentaUsado: 'Number',
    cantidad: 'Number',
    subtotal: 'Number',
    tipoLinea: 'String',
    nota: 'passthrough',
    esExtra: 'Boolean',
    creadoEn: 'Number',
    actualizadoEn: 'Number',
    sincronizado: 'Number'
  }
}

function coerceRow(row, tableName) {
  const types = COLUMN_TYPES[tableName]
  if (!types) return row
  const result = { ...row }
  for (const [key, type] of Object.entries(types)) {
    const val = result[key]
    if (val === undefined || val === null) {
      if (type === 'nullableNumber' || type === 'passthrough') continue
      result[key] = type === 'Number' ? 0 : type === 'Boolean' ? false : type === 'String' ? '' : null
      continue
    }
    switch (type) {
      case 'String': result[key] = String(val); break
      case 'Number': result[key] = Number(val); break
      case 'Boolean': result[key] = Boolean(val); break
      case 'nullableNumber': result[key] = Number(val); break
    }
  }
  return result
}

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
      return rows.length > 0 ? coerceRow(snakeToCamelRow(rows[0]), 'usuarios') : null
    }

    const result = await conn.query({
      statement: 'SELECT * FROM usuarios WHERE nombre = ? LIMIT 1',
      values: [nombre]
    })
    return result.values && result.values[0] ? coerceRow(snakeToCamelRow(result.values[0]), 'usuarios') : null
  }

  /**
   * Lista los productos activos para el cuadre.
   */
  async function getProductosActivos(puestoId) {
    const conn = await getConnection()

    if (conn instanceof InMemoryDb) {
      const rows = conn.where('productos', r => {
        const pid = r.puesto_id ?? r.puestoId
        return pid === puestoId && (r.activo === 1 || r.activo === true)
      })
      return rows.map(r => coerceRow(snakeToCamelRow(r), 'productos'))
    }

    const result = await conn.query({
      statement: 'SELECT * FROM productos WHERE puesto_id = ? AND activo = 1 ORDER BY orden',
      values: [puestoId]
    })
    return (result.values ?? []).map(r => coerceRow(snakeToCamelRow(r), 'productos'))
  }

  /**
   * Obtiene el cuadre del día para un puesto, si existe.
   */
  async function getCuadrePorFecha(puestoId, fecha) {
    const conn = await getConnection()

    if (conn instanceof InMemoryDb) {
      const rows = conn.where('cuadres', r => r.puesto_id === puestoId && r.fecha === fecha)
      return rows.length > 0 ? coerceRow(snakeToCamelRow(rows[0]), 'cuadres') : null
    }

    const result = await conn.query({
      statement: 'SELECT * FROM cuadres WHERE puesto_id = ? AND fecha = ? LIMIT 1',
      values: [puestoId, fecha]
    })
    return result.values && result.values[0] ? coerceRow(snakeToCamelRow(result.values[0]), 'cuadres') : null
  }

  /**
   * Obtiene las líneas de un cuadre.
   */
  async function getItemsDeCuadre(cuadreId) {
    const conn = await getConnection()

    if (conn instanceof InMemoryDb) {
      const rows = conn.where('cuadre_items', r => r.cuadre_id === cuadreId)
      return rows.map(r => coerceRow(snakeToCamelRow(r), 'cuadre_items'))
    }

    const result = await conn.query({
      statement: 'SELECT * FROM cuadre_items WHERE cuadre_id = ? ORDER BY creado_en',
      values: [cuadreId]
    })
    return (result.values ?? []).map(r => coerceRow(snakeToCamelRow(r), 'cuadre_items'))
  }

  /**
   * Inserta una fila en la tabla indicada.
   * Los keys del objeto datos se usan como nombres de columna (snake_case).
   */
  async function insert(tabla, datos) {
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
    await conn.execute({
      statement: `INSERT INTO ${tabla} (${cols}) VALUES (${placeholders})`,
      values: keys.map(k => row[k])
    })
    return datos
  }

  /**
   * Actualiza una fila por su campo `id`.
   */
  async function update(tabla, id, cambios) {
    const cambiosSnake = camelToSnakeRow(cambios)
    const conn = await getConnection()

    if (conn instanceof InMemoryDb) {
      const existing = conn.getById(tabla, id)
      if (existing) Object.assign(existing, cambiosSnake)
      return existing
    }

    const keys = Object.keys(cambiosSnake)
    const setClause = keys.map(k => `${k} = ?`).join(', ')
    await conn.execute({
      statement: `UPDATE ${tabla} SET ${setClause} WHERE id = ?`,
      values: [...keys.map(k => cambiosSnake[k]), id]
    })
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

    await conn.execute({
      statement: `DELETE FROM ${tabla} WHERE id = ?`,
      values: [id]
    })
  }

  /**
   * Retorna todas las filas de una tabla.
   */
  async function queryAll(tabla) {
    const conn = await getConnection()

    if (conn instanceof InMemoryDb) {
      return conn.all(tabla).map(r => snakeToCamelRow(r))
    }

    const result = await conn.query({
      statement: `SELECT * FROM ${tabla}`,
      values: []
    })
    return (result.values ?? []).map(r => snakeToCamelRow(r))
  }

  /**
   * Retorna una fila por su campo `id`, o null si no existe.
   */
  async function getById(tabla, id) {
    const conn = await getConnection()

    if (conn instanceof InMemoryDb) {
      const row = conn.getById(tabla, id)
      return row ? snakeToCamelRow(row) : null
    }

    const result = await conn.query({
      statement: `SELECT * FROM ${tabla} WHERE id = ? LIMIT 1`,
      values: [id]
    })
    return result.values && result.values[0] ? snakeToCamelRow(result.values[0]) : null
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

    const result = await conn.query({
      statement: `SELECT * FROM ${tabla} WHERE ${whereSql}`,
      values: values ?? []
    })
    return (result.values ?? []).map(r => snakeToCamelRow(r))
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
    queryWhere
  }
}

