/**
 * shared/fechas.js — Única conversión de fechas a epoch ms de la app.
 *
 * POR QUÉ EXISTE ESTE MÓDULO
 * El servidor entrega las marcas de tiempo como ISO-8601
 * (server/api/sync/pull.get.ts → serializeRow) y la BD local las guarda en
 * columnas `integer(..., { mode: 'timestamp_ms' })`. Ese ISO en aritmética es
 * veneno: `Number('2026-07-11T19:13:55.004Z')` es NaN, y un NaN que cruza el
 * bridge JSON hacia SQLite llega como NULL — de ahí el
 * "NOT NULL constraint failed: historial_precios.vigente_desde" al cambiar un
 * precio de venta, y el historial que nunca se escribe.
 *
 * Cualquier código que toque una fecha (aritmética, comparación o escritura
 * en SQLite) pasa por aquí en vez de hacer `Number(...)` a su antojo.
 */

/**
 * Epoch en milisegundos de una fecha que puede venir como número, Date o
 * ISO-8601. Sin fecha interpretable devuelve 0, que es el comportamiento
 * histórico de `aEpoch` en shared/inventario/operaciones.js.
 *
 * @param {number|string|Date|null|undefined} v
 * @returns {number}
 */
export function aEpoch(v) {
  if (v == null) return 0
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  if (v instanceof Date) {
    const ms = v.getTime()
    return Number.isNaN(ms) ? 0 : ms
  }
  const n = Date.parse(String(v))
  return Number.isNaN(n) ? 0 : n
}

/**
 * Igual que {@link aEpoch} pero distingue "no hay fecha" (null) del propio
 * origen epoch (0). Lo usan los filtros por rango, donde un null debe
 * ignorar la fila en vez de compararla contra 0.
 *
 * @param {number|string|Date|null|undefined} v
 * @returns {number|null}
 */
export function aEpochOpcional(v) {
  if (v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (v instanceof Date) {
    const ms = v.getTime()
    return Number.isNaN(ms) ? null : ms
  }
  const n = Date.parse(String(v))
  return Number.isNaN(n) ? null : n
}

/**
 * Normaliza en sitio las columnas marcadas como timestamp de una fila.
 * Se usa justo antes de escribir en SQLite: es donde el ISO que llega del
 * servidor se vuelve epoch ms, sin tocar las filas que ya son numéricas.
 *
 * Los valores que no son string (números ya convertidos) o que no parsean
 * se dejan tal cual: es preferible guardar un dato raro a inventar una fecha.
 *
 * @param {Record<string, any>} data fila en camelCase
 * @param {Iterable<string>} claves columnas de la tabla que son timestamp
 * @returns {Record<string, any>} la misma fila o una copia ya normalizada
 */
export function normalizarFechas(data, claves) {
  let out = data
  for (const clave of claves) {
    const valor = data[clave]
    if (typeof valor !== 'string') continue
    const ms = Date.parse(valor)
    if (Number.isNaN(ms)) continue
    if (out === data) out = { ...data }
    out[clave] = ms
  }
  return out
}
