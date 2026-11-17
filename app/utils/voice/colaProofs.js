/**
 * app/utils/voice/colaProofs.js — cola local de proofs sin subir (puro).
 *
 * Un proof se escribe siempre en el teléfono; la subida a `voz_confirmaciones`
 * puede fallar por falta de red. En vez de perderlo, queda en esta cola y se
 * reintenta al volver la red. Las operaciones son puras para probarlas con
 * `node --test`; el almacenamiento y la red viven en `proofs.js`.
 *
 * Sin Vue, sin Capacitor y sin red.
 */

/** Tope de la cola: más allá, se descartan los más viejos. */
export const MAX_COLA = 100
/** Intentos por proof antes de descartarlo. */
export const MAX_INTENTOS = 20
/** Días que se conserva un proof que no logra subir. */
export const MAX_DIAS = 14

const MS_DIA = 24 * 60 * 60 * 1000

function marcaDeTiempo(item) {
  const valor = item?.creado ?? item?.proof?.ts ?? null
  const ms = valor == null ? NaN : Date.parse(valor)
  return Number.isFinite(ms) ? ms : 0
}

/**
 * Agrega un proof al final de la cola. Un id repetido se reemplaza (reintentar
 * dos veces el mismo proof no duplica la fila en el servidor).
 */
export function agregarProof(cola = [], item, { maximo = MAX_COLA } = {}) {
  const actual = Array.isArray(cola) ? cola : []
  if (!item?.id || !item?.proof) return [...actual]
  const sinDuplicado = actual.filter(i => i?.id !== item.id)
  return [...sinDuplicado, item].slice(-Math.max(1, maximo))
}

/** Saca un proof de la cola (subida correcta o descarte explícito). */
export function quitarProof(cola = [], id) {
  return (Array.isArray(cola) ? cola : []).filter(i => i?.id !== id)
}

/** Suma un intento fallido y guarda cuándo fue. */
export function marcarIntentoFallido(cola = [], id, { ahora = Date.now() } = {}) {
  return (Array.isArray(cola) ? cola : []).map(i =>
    i?.id === id
      ? { ...i, intentos: (Number(i.intentos) || 0) + 1, ultimoIntento: ahora }
      : i
  )
}

/** Un proof se reintenta mientras le queden intentos y no haya caducado. */
export function sigueVigente(item, { ahora = Date.now(), maxIntentos = MAX_INTENTOS, maxDias = MAX_DIAS } = {}) {
  if ((Number(item?.intentos) || 0) >= maxIntentos) return false
  const creado = marcaDeTiempo(item)
  if (!creado) return true
  return ahora - creado <= maxDias * MS_DIA
}

/** Los proofs que toca reintentar, en orden de llegada. */
export function proofsPendientes(cola = [], opciones = {}) {
  return (Array.isArray(cola) ? cola : []).filter(i => sigueVigente(i, opciones))
}

/**
 * Descarta los caducados o agotados. Se llama antes de reintentar para que la
 * cola no crezca con proofs que ya no van a subir nunca.
 */
export function purgarCola(cola = [], opciones = {}) {
  return (Array.isArray(cola) ? cola : []).filter(i => sigueVigente(i, opciones))
}
