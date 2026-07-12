/**
 * api-offline/index.js — Dispatch centralizado de las operaciones offline.
 *
 * Dado un nombre de tabla, devuelve el módulo con sus operaciones
 * (list, get, create, update, patch, remove, [acciones custom]).
 *
 * Las funciones se cargan de forma lazy (dynamic import) para que
 * no se pague el costo de módulos que no se usan.
 *
 * Convención de nombres por módulo:
 *   - list.js       → exporta `list({ puestoId, ... })`
 *   - get.js        → exporta `get(id)`
 *   - create.js     → exporta `create(datos, auth)`
 *   - update.js     → exporta `update(id, cambios, auth)`
 *   - patch.js      → exporta `patch(id, cambios, auth)`
 *   - remove.js     → exporta `remove(id, auth)`
 *   - <custom>.js   → exporta la acción custom
 */

import * as usuarios from './usuarios'
import * as productos from './productos'
import * as cuadres from './cuadres'
import * as cuadreItems from './cuadre_items'
import * as clientes from './clientes'
import * as cuentasFiado from './cuentas_fiado'
import * as cuentasFiadoItems from './cuentas_fiado_items'
import * as pagosFiado from './pagos_fiado'

const MODULOS_POR_TABLA = {
  usuarios,
  productos,
  cuadres,
  cuadre_items: cuadreItems,
  clientes,
  cuentas_fiado: cuentasFiado,
  cuentas_fiado_items: cuentasFiadoItems,
  pagos_fiado: pagosFiado
}

/**
 * Retorna el módulo de operaciones para la tabla indicada, o null
 * si la tabla no tiene un módulo dedicado.
 * @param {string} tabla — nombre de tabla (snake_case)
 * @returns {object|null}
 */
export function getModulo(tabla) {
  return MODULOS_POR_TABLA[tabla] ?? null
}

/**
 * Crea un objeto repo con la forma estándar { create, read, readAll, update, patch, remove }
 * mapeando a las funciones del módulo (get, list, create, update, patch, remove).
 * Útil para que useRepo(tabla) devuelva un shape uniforme.
 * @param {string} tabla
 * @returns {object|null}
 */
export function crearRepo(tabla) {
  const m = getModulo(tabla)
  if (!m) return null
  return {
    create: m.create,
    read: m.get,
    readAll: m.list,
    update: m.update,
    patch: m.patch,
    remove: m.remove
  }
}
