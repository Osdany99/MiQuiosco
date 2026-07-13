/**
 * server-offline/utils/normalize.js
 *
 * Conversores entre snake_case (formato SQL) y camelCase (formato JS/Drizzle).
 * Centraliza las funciones que usaba inline useLocalDb.js.
 */

/**
 * snake_case → camelCase para nombres de clave.
 * @param {string} key
 * @returns {string}
 */
export function snakeToCamelKey(key) {
  return key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
}

/**
 * camelCase → snake_case para nombres de clave.
 * @param {string} key
 * @returns {string}
 */
export function camelToSnakeKey(key) {
  return key.replace(/[A-Z]/g, c => '_' + c.toLowerCase())
}

/**
 * Convierte un objeto fila de snake_case a camelCase.
 * @param {object} row
 * @returns {object}
 */
export function snakeToCamelRow(row) {
  if (!row || typeof row !== 'object') return row
  const out = {}
  for (const [k, v] of Object.entries(row)) {
    out[snakeToCamelKey(k)] = v
  }
  return out
}

/**
 * Convierte un objeto fila de camelCase a snake_case.
 * @param {object} row
 * @returns {object}
 */
export function camelToSnakeRow(row) {
  if (!row || typeof row !== 'object') return row
  const out = {}
  for (const [k, v] of Object.entries(row)) {
    out[camelToSnakeKey(k)] = v
  }
  return out
}

/**
 * Convierte un valor ISO-8601 a epoch (ms).
 * @param {string|number} v
 * @returns {number|null}
 */
export function isoToEpoch(v) {
  if (v == null) return null
  const n = typeof v === 'number' ? v : Date.parse(v)
  return Number.isNaN(n) ? null : n
}
