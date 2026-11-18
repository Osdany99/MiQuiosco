/**
 * app/utils/voice/pendientes.js — acciones dictadas por voz (puro).
 *
 * La voz guarda lo dictado como una acción pendiente y espera revisión humana.
 * Aquí vive lo que no necesita Vue ni base de datos: el stock proyectado (lo
 * que queda después de descontar lo pendiente), la antigüedad de cada acción y
 * las reglas de caducidad.
 *
 * Sin dependencias: se prueba con `node --test` (tests/pendientesVoz.test.js).
 */

/** Tope de seguridad: pasado este tiempo la acción se archiva sola. */
export const DIAS_CADUCIDAD = 7
export const MS_DIA = 24 * 60 * 60 * 1000

function entero(valor) {
  const n = Math.trunc(Number(valor) || 0)
  return n > 0 ? n : 0
}

function monto(valor) {
  const n = Number(valor) || 0
  return Math.round(n * 100) / 100
}

/** Clave del mapa de proyección: una sola por producto y ubicación. */
export function claveStock(productoId, ubicacion) {
  return `${productoId}:${ubicacion}`
}

/**
 * Suma lo pendiente por producto + ubicación.
 * @returns {Map<string, { productoId: string, ubicacion: string, cantidad: number, importe: number, acciones: number }>}
 */
export function agruparPendientes(acciones) {
  const mapa = new Map()
  for (const accion of acciones ?? []) {
    if (!accion || accion.estado !== 'pendiente' || !accion.productoId) continue
    const clave = claveStock(accion.productoId, accion.ubicacion)
    const actual = mapa.get(clave) ?? {
      productoId: accion.productoId,
      ubicacion: accion.ubicacion,
      cantidad: 0,
      importe: 0,
      acciones: 0
    }
    actual.cantidad += entero(accion.cantidad)
    actual.importe += monto(accion.importe)
    actual.acciones += 1
    mapa.set(clave, actual)
  }
  return mapa
}

/**
 * Descuenta del catálogo lo que está pendiente de revisión.
 *
 * Los campos `quiosco`/`almacen` quedan PROYECTADOS (stock real menos lo
 * pendiente) porque es lo que debe responder la voz y lo que puede venderse.
 * El valor real se conserva en `quioscoReal`/`almacenReal` para que la pantalla
 * de revisión pueda explicar la diferencia.
 */
export function proyectarStock(filas, acciones) {
  const grupos = agruparPendientes(acciones)
  const lista = filas ?? []
  if (!grupos.size) return lista
  return lista.map((fila) => {
    const id = fila?.productoId ?? fila?.id
    if (!id) return fila
    const enQuiosco = grupos.get(claveStock(id, 'quiosco'))?.cantidad ?? 0
    const enAlmacen = grupos.get(claveStock(id, 'almacen'))?.cantidad ?? 0
    if (!enQuiosco && !enAlmacen) return fila
    const realQuiosco = Number(fila.quiosco ?? 0)
    const realAlmacen = Number(fila.almacen ?? 0)
    return {
      ...fila,
      quioscoReal: realQuiosco,
      almacenReal: realAlmacen,
      quiosco: Math.max(0, realQuiosco - enQuiosco),
      almacen: Math.max(0, realAlmacen - enAlmacen),
      pendienteQuiosco: enQuiosco,
      pendienteAlmacen: enAlmacen
    }
  })
}

/** Stock proyectado de una fila concreta (atajo para la pantalla). */
export function stockProyectado(fila, ubicacion) {
  const valor = Number(fila?.[ubicacion] ?? 0)
  return Number.isFinite(valor) ? valor : 0
}

/** "ahora mismo" | "hace 5 min" | "hace 3 h" | "ayer" | "hace 4 días". */
export function etiquetaAntiguedad(dictadoEn, ahora = Date.now()) {
  const ms = Number(ahora) - Number(dictadoEn)
  if (!Number.isFinite(ms)) return ''
  if (ms <= 0) return 'ahora mismo'
  const minutos = Math.floor(ms / 60000)
  if (minutos < 1) return 'ahora mismo'
  if (minutos < 60) return `hace ${minutos} min`
  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `hace ${horas} h`
  const dias = Math.floor(horas / 24)
  if (dias === 1) return 'ayer'
  return `hace ${dias} días`
}

/** Pasado el tope de seguridad ya no se puede aplicar: se archiva. */
export function estaCaducada(dictadoEn, ahora = Date.now()) {
  const ms = Number(ahora) - Number(dictadoEn)
  if (!Number.isFinite(ms)) return false
  return ms > DIAS_CADUCIDAD * MS_DIA
}

/**
 * ¿Se puede aplicar? Solo acciones pendientes, dentro del tope de seguridad y
 * con producto identificado. El stock se valida al aplicar, no aquí: puede
 * haber cambiado.
 */
export function puedeAplicar(accion, { ahora = Date.now() } = {}) {
  if (!accion || accion.estado !== 'pendiente') return false
  if (!accion.productoId) return false
  if (entero(accion.cantidad) < 1) return false
  return !estaCaducada(accion.dictadoEn, ahora)
}

/** Resumen para el badge y las tarjetas de la pantalla. */
export function resumenPendientes(acciones, { ahora = Date.now() } = {}) {
  let cantidad = 0
  let importe = 0
  let caducadas = 0
  for (const accion of acciones ?? []) {
    if (!accion || accion.estado !== 'pendiente') continue
    cantidad += 1
    importe += monto(accion.importe)
    if (estaCaducada(accion.dictadoEn, ahora)) caducadas += 1
  }
  return { cantidad, importe: monto(importe), caducadas }
}
