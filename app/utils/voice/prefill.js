/**
 * app/utils/voice/prefill.js — ajustes de prefill por voz (puro).
 */

export function ajustarCantidadVoz(cantidad, stockDisponible) {
  const qty = Math.max(1, Math.trunc(Number(cantidad) || 1))
  const max = Number(stockDisponible)
  if (!max || max <= 0) {
    return { cantidad: qty, excede: false, disponible: null }
  }
  if (qty <= max) {
    return { cantidad: qty, excede: false, disponible: max }
  }
  return { cantidad: qty, excede: true, disponible: max }
}
