export function fmtNumero(v) {
  if (v == null || Number.isNaN(v)) return '0'
  if (v >= 1000000) return (v / 1000000).toFixed(1) + 'M'
  if (v >= 1000) return (v / 1000).toFixed(1) + 'K'
  return Number(v).toFixed(0)
}

const EXACTO = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 })

/**
 * Número sin abreviar, para cuando hace falta saber la cantidad exacta: el
 * tooltip de una gráfica, las cifras de auditoría.
 *
 * fmtNumero abrevia a "5.0K", que va bien en un eje (ahí manda que quepa) y
 * está mal en un tooltip: ahí la persona pasó el cursor para ver el número, y
 * "5.0K" no dice si eran 5.042 o 5.480. Al final del rango arranca con 1000.
 */
export function fmtNumeroExacto(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return '0'
  return EXACTO.format(n)
}
