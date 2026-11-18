/**
 * consumoLotes — Utilidades de consumición multi-lote (FIFO y manual).
 *
 * La misma función descompone una cantidad en líneas por lote dado un
 * orden de consumo priorizado (menor rank primero). Si no hay stock
 * suficiente, reporta `faltante > 0`.
 *
 * Las entradas de lote deben tener al menos `{ id, saldo }`.
 */

/**
 * Calcula el plan de consumo dada una lista de lotes ordenada por rango
 * de consumo (menor rank → consume primero).
 *
 * @param {Array<{id:string, saldo:number}>} lotesOrdenados
 * @param {number} cantidad
 * @returns {{ lineas: {loteId:string, cantidad:number}[], consumido:number, faltante:number }}
 */
export function calcularConsumoLotes(lotesOrdenados = [], cantidad = 0) {
  const out = []
  let restante = Math.max(0, Math.trunc(Number(cantidad) || 0))
  if (restante <= 0) return { lineas: out, consumido: 0, faltante: 0 }

  for (const l of lotesOrdenados || []) {
    if (restante <= 0) break
    const saldo = Math.max(0, Number(l?.saldo) || 0)
    if (saldo <= 0) continue
    const toma = Math.min(restante, saldo)
    if (toma > 0) {
      out.push({ loteId: l.id, cantidad: toma })
      restante -= toma
    }
  }
  return { lineas: out, consumido: (Number(cantidad) || 0) - restante, faltante: restante }
}

/**
 * Ordena los lotes seleccionados según sus ranks (menor → mayor) sin mutar
 * la lista original. Si dos comparten rank, se recurre a fechaEntrada.
 *
 * @param {Array<{id:string, rank:number, fechaEntrada?:string}>} seleccionados
 * @returns {Array<{id:string, rank:number, fechaEntrada?:string}>}
 */
export function ordenarPorRango(seleccionados = []) {
  return [...(seleccionados || [])].sort((a, b) => {
    const ra = Number.isFinite(Number(a?.rank)) ? Number(a.rank) : 99999
    const rb = Number.isFinite(Number(b?.rank)) ? Number(b.rank) : 99999
    if (ra !== rb) return ra - rb
    if (a?.fechaEntrada && b?.fechaEntrada) {
      return String(a.fechaEntrada).localeCompare(String(b.fechaEntrada))
    }
    return 0
  })
}

/**
 * Genera un ranking FIFO por fechaEntrada (más antiguo → rank 1).
 *
 * @param {Array<{id:string, fechaEntrada?:string, saldo?:number}>} lotes
 * @returns {Array<{id:string, rank:number, fechaEntrada?:string, saldo?:number}>}
 */
export function ranksFifo(lotes = []) {
  const ordenados = [...(lotes || [])].sort((a, b) => {
    if (a?.fechaEntrada && b?.fechaEntrada) return String(a.fechaEntrada).localeCompare(String(b.fechaEntrada))
    return 0
  })
  return ordenados.map((l, idx) => ({ ...l, rank: idx + 1 }))
}
