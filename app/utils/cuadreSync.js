/**
 * cuadreSync.js — Guarda las líneas del cuadre en su backend sin duplicarlas.
 *
 * Vive en utils/ y no como composable porque lo usa un solo sitio (useCuadre),
 * y es una función sin estado de Vue: recibe la lista en memoria y una capa de
 * acceso, así que se puede probar sin montar un componente.
 *
 * Tres reglas, cada una tapa un fallo real del cuadre del 2026-11-19:
 *
 *  1. Si la lectura no devolvió un array, NO se escribe nada. `useRepo` entrega
 *     `{ data: null, error }` cuando falla; tratar ese null como "no hay
 *     líneas" borraba y recreaba el cuadre completo.
 *  2. La fila que devuelve `crear` es la autoridad: se adopta su id. Antes se
 *     descartaba y, si el servidor generaba otro id, la siguiente pasada no
 *     encontraba la línea y la volvía a crear.
 *  3. Si una escritura falla, se aborta la pasada y no se borra nada. Borrar
 *     con información incompleta es lo que dejaba el cuadre a medias.
 */

/**
 * ¿Hay que reescribir la fila guardada con lo que hay en memoria?
 *
 * Se comparan solo los campos que definen la línea; `sincronizado`,
 * `creadoEn` y demás los maneja cada backend.
 */
export function lineaCambio(existente, linea) {
  return Number(existente.cantidad) !== Number(linea.cantidad)
    || Number(existente.precioVentaUsado) !== Number(linea.precioVentaUsado)
    || (existente.loteId ?? null) !== (linea.loteId ?? null)
    || existente.tipoLinea !== linea.tipoLinea
    || (existente.nota ?? null) !== (linea.nota ?? null)
    || Boolean(existente.esExtra) !== Boolean(linea.esExtra)
    || Number(existente.secuencia ?? 0) !== Number(linea.secuencia ?? 0)
}

/** Cuerpo de alta/edición de una línea. Un solo sitio para no desincronizarlos. */
export function payloadLinea(linea, cuadreId) {
  return {
    id: linea.id,
    cuadreId: linea.cuadreId ?? cuadreId,
    productoId: linea.productoId,
    loteId: linea.loteId ?? null,
    precioVentaUsado: linea.precioVentaUsado,
    cantidad: linea.cantidad,
    subtotal: linea.subtotal,
    tipoLinea: linea.tipoLinea,
    nota: linea.nota ?? null,
    esExtra: Boolean(linea.esExtra),
    secuencia: Number(linea.secuencia ?? 0)
  }
}

/**
 * Sincroniza la lista en memoria con lo que hay guardado.
 *
 * `lineas` se modifica en sitio: cuando el backend contesta con otro id, la
 * línea en memoria adopta ese id para que la próxima pasada la actualice.
 *
 * @param {object} opts
 * @param {Array<object>} opts.lineas        líneas en memoria (se mutan)
 * @param {Array<object>|null} opts.existentes filas leídas del backend
 * @param {string} opts.cuadreId
 * @param {{ crear: Function, actualizar: Function, eliminar: Function }} opts.api
 * @param {boolean} [opts.permitirBorradoTotal] dejar vaciar el cuadre a propósito
 * @returns {Promise<{ok: boolean, motivo: string|null, creadas: number,
 *   actualizadas: number, eliminadas: number, error?: unknown}>}
 */
export async function sincronizarLineas({ lineas, existentes, cuadreId, api, permitirBorradoTotal = false }) {
  const resultado = { ok: false, motivo: null, creadas: 0, actualizadas: 0, eliminadas: 0 }

  // 1. Lectura fallida o incompleta: no se toca nada.
  if (!Array.isArray(existentes)) {
    resultado.motivo = 'lectura'
    return resultado
  }

  const delCuadre = existentes.filter(i => (i?.cuadreId ?? cuadreId) === cuadreId)

  // Un cuadre con líneas guardadas no puede quedarse sin ninguna por una lista
  // en memoria vacía (carga fallida, pantalla recién abierta): sería borrar el
  // cuadre entero. El vaciado deliberado se pide con `permitirBorradoTotal`.
  if (!permitirBorradoTotal && lineas.length === 0 && delCuadre.length > 0) {
    resultado.motivo = 'vacio'
    return resultado
  }

  const porId = new Map(delCuadre.map(i => [i.id, i]))
  const guardadas = new Set()

  try {
    for (const linea of lineas) {
      const existente = porId.get(linea.id)
      if (existente) {
        if (lineaCambio(existente, linea)) {
          await api.actualizar(existente.id, payloadLinea(linea, cuadreId))
          resultado.actualizadas++
        }
        guardadas.add(existente.id)
        continue
      }
      const creada = await api.crear(payloadLinea(linea, cuadreId))
      // 2. El id que manda es el que devuelve el backend, no el que creíamos.
      const idFinal = creada?.id ?? linea.id
      if (idFinal !== linea.id) linea.id = idFinal
      if (!linea.cuadreId) linea.cuadreId = creada?.cuadreId ?? cuadreId
      guardadas.add(idFinal)
      resultado.creadas++
    }
  } catch (error) {
    // 3. Escritura a medias: se devuelve sin borrar lo que quedaba.
    resultado.motivo = 'escritura'
    resultado.error = error
    return resultado
  }

  for (const existente of delCuadre) {
    if (guardadas.has(existente.id)) continue
    try {
      await api.eliminar(existente.id)
      resultado.eliminadas++
    } catch (error) {
      resultado.motivo = 'escritura'
      resultado.error = error
      return resultado
    }
  }

  resultado.ok = true
  return resultado
}
