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
    out[k.replace(/[A-Z]/g, c => '_' + c.toLowerCase())] = v
  }
  return out
}
