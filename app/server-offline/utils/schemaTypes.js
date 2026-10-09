const TABLE_NAME = Symbol.for('drizzle:Name')
const TABLE_COLUMNS = Symbol.for('drizzle:Columns')

function deriveColumnType(col) {
  // Las columnas integer(..., { mode: 'timestamp_ms' }) guardan epoch ms, no
  // texto. Drizzle las marca dataType 'date', así que sin esta línea caían en
  // 'passthrough' y un ISO del servidor se colaba tal cual en la columna
  // integer: luego Number(iso) es NaN y el INSERT se va con
  // NOT NULL constraint failed. Se comprueban primero porque 'date' no es
  // ninguno de los dataType de abajo.
  if (col.mode === 'timestamp_ms') return 'timestamp'
  if (col.dataType === 'string') return col.notNull ? 'String' : 'passthrough'
  if (col.dataType === 'boolean') return col.notNull ? 'Boolean' : 'nullableNumber'
  if (col.dataType === 'number') return col.notNull ? 'Number' : 'nullableNumber'
  return 'passthrough'
}

/**
 * Deriva el mapa COLUMN_TYPES desde las tablas Drizzle.
 * Retorna { nombre_tabla: { columnaCamel: 'String'|'Number'|'Boolean'|'nullableNumber'|'passthrough' } }
 */
export function deriveColumnTypes(schema) {
  const map = {}
  for (const table of Object.values(schema)) {
    if (!table || typeof table !== 'object') continue
    const tableName = table[TABLE_NAME]
    if (!tableName) continue
    const columns = table[TABLE_COLUMNS]
    if (!columns) continue
    const types = {}
    for (const [key, col] of Object.entries(columns)) {
      types[key] = deriveColumnType(col)
    }
    map[tableName] = types
  }
  return map
}

/**
 * Deriva el mapa { nombre_tabla: Set<columnaCamel> } con las columnas que
 * guardan epoch ms (integer con mode 'timestamp_ms'). Lo usa la capa de
 * escritura para convertir el ISO que llega del servidor antes de tocar
 * SQLite, que es donde el string se convertiría en NULL al pasar por el
 * bridge JSON.
 */
export function deriveTimestampCols(schema) {
  const map = {}
  for (const table of Object.values(schema)) {
    if (!table || typeof table !== 'object') continue
    const tableName = table[TABLE_NAME]
    const columns = tableName ? table[TABLE_COLUMNS] : null
    if (!columns) continue
    const claves = []
    for (const [key, col] of Object.entries(columns)) {
      if (deriveColumnType(col) === 'timestamp') claves.push(key)
    }
    if (claves.length) map[tableName] = claves
  }
  return map
}

/**
 * Deriva la lista de nombres de tabla desde el schema Drizzle.
 */
export function deriveTableNames(schema) {
  const names = []
  for (const table of Object.values(schema)) {
    if (!table || typeof table !== 'object') continue
    const tableName = table[TABLE_NAME]
    if (tableName) names.push(tableName)
  }
  return names
}

/**
 * Deriva las definiciones DDL de las columnas desde el schema Drizzle.
 * Retorna { nombre_tabla: [{ name, sqlType, notNull, default }] }.
 * Sirve para reconciliar una instalación existente contra el schema actual.
 */
export function deriveColumnDefs(schema) {
  const map = {}
  for (const table of Object.values(schema)) {
    if (!table || typeof table !== 'object') continue
    const tableName = table[TABLE_NAME]
    if (!tableName) continue
    const columns = table[TABLE_COLUMNS]
    if (!columns) continue
    const defs = []
    for (const col of Object.values(columns)) {
      defs.push({
        name: col.name,
        sqlType: typeof col.getSQLType === 'function' ? col.getSQLType() : 'text',
        notNull: Boolean(col.notNull),
        default: col.default
      })
    }
    map[tableName] = defs
  }
  return map
}

/**
 * Convierte los valores de una fila a sus tipos JS correctos
 * según el mapa de tipos derivado del schema.
 */
export function coerceRow(row, columnTypes) {
  if (!columnTypes) return row
  const result = { ...row }
  for (const [key, type] of Object.entries(columnTypes)) {
    const val = result[key]
    if (val === undefined || val === null) {
      if (type === 'nullableNumber' || type === 'passthrough') continue
      result[key] = type === 'Number' ? 0 : type === 'Boolean' ? false : type === 'String' ? '' : null
      continue
    }
    switch (type) {
      case 'String':
        result[key] = String(val)
        break
      case 'Number':
        result[key] = Number(val)
        break
      case 'Boolean':
        result[key] = Boolean(val)
        break
      case 'nullableNumber':
        result[key] = Number(val)
        break
      case 'timestamp':
        // Lectura tolerante: el pull del servidor entrega ISO-8601
        // (serializeRow en server/api/sync/pull.get.ts) y una instalación
        // antigua puede tener texto ISO en columnas integer. Normalizar al
        // leer deja al dispositivo sano sin necesidad de migración de datos.
        if (typeof val === 'string') {
          const ms = Date.parse(val)
          if (!Number.isNaN(ms)) result[key] = ms
        }
        break
    }
  }
  return result
}
