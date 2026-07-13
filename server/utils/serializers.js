/**
 * server/utils/serializers.js — Serializadores compartidos para Postgres.
 *
 * Convierten una fila cruda de Drizzle (numeric como string, timestamp como Date)
 * al shape que consume el cliente (números JS, fechas como ISO string).
 *
 * `serializeRow(table, row)` aplica el serializador correspondiente a la tabla
 * basándose en su metadata Drizzle: detecta columnas numeric/timestamp/date.
 *
 * Los overrides por entity (en onlineOverrides.js) pueden sobreescribir campos
 * concretos (e.g. JOIN con otras tablas).
 */
import { snakeToCamelKey } from '../../app/server-offline/utils/normalize'

const TABLE_NAME = Symbol.for('drizzle:Name')
const TABLE_COLUMNS = Symbol.for('drizzle:Columns')

/** Mapa por nombre de tabla con los tipos lógicos de cada columna camel. */
function buildColumnTypesByTable(schema) {
  const out = {}
  for (const table of Object.values(schema)) {
    if (!table || typeof table !== 'object') continue
    const name = table[TABLE_NAME]
    const cols = table[TABLE_COLUMNS]
    if (!name || !cols) continue
    const map = {}
    for (const [key, col] of Object.entries(cols)) {
      map[key] = col
    }
    out[name] = map
  }
  return out
}

/**
 * Serializa una fila para enviar al cliente.
 * - numeric → Number (o null si viene null en columnas nullable)
 * - timestamp → ISO string (o null)
 * - date → 'YYYY-MM-DD' (Date o string) (o null)
 * - boolean, int, uuid, string, text → se devuelven tal cual
 *
 * @param {Object} cols - metadatos de columnas (con .dataType y .name)
 * @param {Object} row  - fila cruda (claves camelCase, valores nativos de Postgres)
 * @returns {Object}
 */
export function serializeRowWithColumns(cols, row) {
  const out = {}
  for (const [k, v] of Object.entries(row ?? {})) {
    const col = cols[k]
    if (!col) {
      out[k] = v
      continue
    }
    out[k] = serializeValue(col, v)
  }
  return out
}

function serializeValue(col, v) {
  if (v == null) return null
  switch (col.dataType) {
    case 'number':
      // numeric: viene como string; int: viene como number
      return typeof v === 'string' ? Number(v) : Number(v)
    case 'boolean':
      return Boolean(v)
    case 'date': {
      // Drizzle date → 'YYYY-MM-DD' string
      if (v instanceof Date) return v.toISOString().slice(0, 10)
      return String(v)
    }
    case 'string':
      return String(v)
    default:
      // timestamp y otros: dejar como Date o string
      return v instanceof Date ? v.toISOString() : v
  }
}

/**
 * Factory: devuelve un `serialize(row)` adaptado al schema online.
 * @param {Object} schema
 * @returns {(row: Object) => Object}
 */
export function makeRowSerializer(schema) {
  const byTable = buildColumnTypesByTable(schema)
  return function serialize(tabla, row) {
    const cols = byTable[tabla]?.[Symbol.for('drizzle:Columns')] || byTable[tabla]
    if (!cols) return row
    return serializeRowWithColumns(cols, row)
  }
}

/**
 * Convierte una fila cruda (claves snake_case) a camelCase y luego serializa.
 * Útil cuando el resultado viene de un select() con nombres en snake_case.
 */
export function toCamelAndSerialize(cols, row) {
  if (!row) return row
  const cam = {}
  for (const [k, v] of Object.entries(row)) {
    cam[snakeToCamelKey(k)] = v
  }
  return serializeRowWithColumns(cols, cam)
}

export { buildColumnTypesByTable, TABLE_NAME, TABLE_COLUMNS }
