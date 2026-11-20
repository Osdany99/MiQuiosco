/**
 * shared/inventario/lineasCuadre.js — Identidad funcional de una línea de
 * cuadre y deduplicado del conjunto.
 *
 * Una línea se identifica por (producto, secuencia, lote, esExtra). La
 * secuencia existe justo para permitir varias líneas del mismo producto el
 * mismo día (venta partida, precio que cambió) sin que se confundan: si dos
 * filas coinciden en las cuatro, son la MISMA línea guardada dos veces, no una
 * venta doble legítima.
 *
 * Esa es la forma que tomó el fallo del 2026-11-19: al cambiar de online a
 * local el autoguardado volvió a crear el cuadre completo con ids nuevos, y
 * como la carga solo fusionaba por id, ambos juegos sobrevivían y el FIFO
 * descontaba el stock dos veces.
 *
 * Lo usan los tres sitios que tratan las líneas como un conjunto —carga del
 * cuadre, guardado del borrador y cierre (FIFO)— para que apliquen la misma
 * regla. Lógica pura: sin Vue, sin Drizzle, sin Capacitor.
 */
import { aEpochOpcional } from '../fechas.js'

/**
 * Clave de identidad funcional de una línea.
 *
 * `loteId` entra en la clave porque un lote especial (liquidación,
 * defectuoso) duplica la línea del mismo producto con otro precio: son dos
 * líneas distintas aunque compartan secuencia.
 */
export function claveLineaCuadre(l) {
  return [
    l?.productoId ?? '',
    Number(l?.secuencia ?? 0),
    l?.loteId ?? '',
    l?.esExtra ? 1 : 0
  ].join('|')
}

/** Instante de la línea: la creación manda; sin ella, la última edición. */
function instante(l) {
  return aEpochOpcional(l?.creadoEn) ?? aEpochOpcional(l?.actualizadoEn) ?? 0
}

/** ¿`a` es más reciente que `b`? A igualdad de fecha gana el id mayor, para
 *  que el resultado no dependa del orden en que llegaron las filas. */
function masReciente(a, b, instanteDe) {
  const ta = instanteDe(a)
  const tb = instanteDe(b)
  if (ta !== tb) return ta > tb
  return String(a?.id ?? '') > String(b?.id ?? '')
}

/**
 * Deja una sola línea por clave, conservando la más reciente (la que refleja
 * la última edición del jefe).
 *
 * @param {Array<object>} lineas
 * @param {{ instanteDe?: (linea: object) => number }} [opts] `instanteDe`
 *   permite al servidor usar la fecha de la fila guardada cuando el payload
 *   del cliente no trae `creadoEn` (cierre desde una APK vieja).
 * @returns {{ lineas: Array<object>, descartadas: Array<object> }}
 */
export function deduplicarLineasCuadre(lineas, { instanteDe = instante } = {}) {
  const porClave = new Map()
  const descartadas = []
  for (const l of Array.isArray(lineas) ? lineas : []) {
    const clave = claveLineaCuadre(l)
    const previa = porClave.get(clave)
    if (!previa) {
      porClave.set(clave, l)
      continue
    }
    const [ganadora, perdedora] = masReciente(l, previa, instanteDe) ? [l, previa] : [previa, l]
    porClave.set(clave, ganadora)
    descartadas.push(perdedora)
  }
  return { lineas: [...porClave.values()], descartadas }
}
