const TABLE_NAME = Symbol.for('drizzle:Name')
const TABLE_COLUMNS = Symbol.for('drizzle:Columns')

/**
 * Deriva un mapa { nombre_tabla: { columnaCamel: 'columna_sql' } }
 * desde el schema Drizzle. Sirve para validar que las columnas usadas
 * en consultas coincidan con la definición del schema.
 */
export function deriveColumnMap(schema) {
  const map = {}
  for (const table of Object.values(schema)) {
    if (!table || typeof table !== 'object') continue
    const tableName = table[TABLE_NAME]
    if (!tableName) continue
    const columns = table[TABLE_COLUMNS]
    if (!columns) continue
    const cols = {}
    for (const [key, col] of Object.entries(columns)) {
      cols[key] = col.name
    }
    map[tableName] = cols
  }
  return map
}

/**
 * Valida que las columnas en un objeto (camelCase) existan en el mapa
 * de columnas conocido para la tabla. Advierte con console.warn si
 * encuentra columnas inesperadas.
 */
export function validateColumns(tableName, columnMap, data) {
  if (!columnMap) return
  const known = columnMap[tableName]
  if (!known) return
  const knownValues = Object.values(known)
  for (const key of Object.keys(data)) {
    if (!(key in known) && !knownValues.includes(key)) {
      console.warn(`[tablaColumnas] Columna inesperada "${key}" en tabla "${tableName}"`)
    }
  }
}
