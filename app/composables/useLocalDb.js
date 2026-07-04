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
        cambiado_por TEXT, creado_en INTEGER NOT NULL
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
      return rows.length > 0 ? rowToUsuarioSQLite(rows[0]) : null
    }

    const result = await conn.query({
      statement: 'SELECT * FROM usuarios WHERE nombre = ? LIMIT 1',
      values: [nombre]
    })
    return result.values && result.values[0] ? rowToUsuarioSQLite(result.values[0]) : null
  }

  /**
   * Lista los productos activos para el cuadre.
   */
  async function getProductosActivos(puestoId) {
    const conn = await getConnection()

    if (conn instanceof InMemoryDb) {
      const rows = conn.where('productos', r =>
        r.puesto_id === puestoId && r.activo === 1
      )
      return rows.map(rowToProducto)
    }

    const result = await conn.query({
      statement: 'SELECT * FROM productos WHERE puesto_id = ? AND activo = 1 ORDER BY orden',
      values: [puestoId]
    })
    return (result.values ?? []).map(rowToProducto)
  }

  /**
   * Obtiene el cuadre del día para un puesto, si existe.
   */
  async function getCuadrePorFecha(puestoId, fecha) {
    const conn = await getConnection()

    if (conn instanceof InMemoryDb) {
      const rows = conn.where('cuadres', r => r.puesto_id === puestoId && r.fecha === fecha)
      return rows.length > 0 ? rowToCuadre(rows[0]) : null
    }

    const result = await conn.query({
      statement: 'SELECT * FROM cuadres WHERE puesto_id = ? AND fecha = ? LIMIT 1',
      values: [puestoId, fecha]
    })
    return result.values && result.values[0] ? rowToCuadre(result.values[0]) : null
  }

  /**
   * Obtiene las líneas de un cuadre.
   */
  async function getItemsDeCuadre(cuadreId) {
    const conn = await getConnection()

    if (conn instanceof InMemoryDb) {
      const rows = conn.where('cuadre_items', r => r.cuadre_id === cuadreId)
      return rows.map(rowToCuadreItem)
    }

    const result = await conn.query({
      statement: 'SELECT * FROM cuadre_items WHERE cuadre_id = ? ORDER BY creado_en',
      values: [cuadreId]
    })
    return (result.values ?? []).map(rowToCuadreItem)
  }

  return {
    getUsuarioPorNombreLocal,
    getProductosActivos,
    getCuadrePorFecha,
    getItemsDeCuadre
  }
}

// =====================================================================
// Mappers: filas de SQLite → objetos usados en la app
// =====================================================================

function rowToUsuarioSQLite(r) {
  return {
    id: String(r.id),
    puestoId: String(r.puesto_id),
    nombre: String(r.nombre),
    rol: r.rol,
    pinHash: String(r.pin_hash),
    activo: Boolean(r.activo),
    debeCambiarPin: Boolean(r.debe_cambiar_pin),
    creadoEn: Number(r.creado_en),
    actualizadoEn: Number(r.actualizado_en)
  }
}

function rowToProducto(r) {
  return {
    id: String(r.id),
    puestoId: String(r.puesto_id),
    nombre: String(r.nombre),
    descripcion: r.descripcion,
    activo: Boolean(r.activo),
    orden: Number(r.orden),
    precioCompraActual: Number(r.precio_compra_actual),
    precioVentaActual: Number(r.precio_venta_actual),
    creadoEn: Number(r.creado_en),
    actualizadoEn: Number(r.actualizado_en),
    sincronizado: Boolean(r.sincronizado)
  }
}

function rowToCuadre(r) {
  return {
    id: String(r.id),
    puestoId: String(r.puesto_id),
    fecha: String(r.fecha),
    jefeId: String(r.jefe_id),
    trabajadorTurnoId: r.trabajador_turno_id,
    pagoTrabajador: r.pago_trabajador != null ? Number(r.pago_trabajador) : null,
    totalEsperado: Number(r.total_esperado),
    totalRealCaja: r.total_real_caja != null ? Number(r.total_real_caja) : null,
    montoTransferencia: Number(r.monto_transferencia),
    montoFiado: Number(r.monto_fiado),
    diferencia: r.diferencia != null ? Number(r.diferencia) : null,
    estado: r.estado,
    notas: r.notas,
    cerradoEn: r.cerrado_en != null ? Number(r.cerrado_en) : null,
    reabiertoVeces: Number(r.reabierto_veces),
    ultimaReaperturaEn: r.ultima_reapertura_en != null ? Number(r.ultima_reapertura_en) : null,
    creadoEn: Number(r.creado_en),
    actualizadoEn: Number(r.actualizado_en),
    sincronizado: Boolean(r.sincronizado)
  }
}

function rowToCuadreItem(r) {
  return {
    id: String(r.id),
    cuadreId: String(r.cuadre_id),
    productoId: String(r.producto_id),
    precioVentaUsado: Number(r.precio_venta_usado),
    cantidad: Number(r.cantidad),
    subtotal: Number(r.subtotal),
    tipoLinea: r.tipo_linea,
    nota: r.nota,
    esExtra: Boolean(r.es_extra),
    creadoEn: Number(r.creado_en),
    actualizadoEn: Number(r.actualizado_en),
    sincronizado: Boolean(r.sincronizado)
  }
}
