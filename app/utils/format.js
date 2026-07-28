export function fmtNumero(v) {
  if (v == null || Number.isNaN(v)) return '0'
  if (v >= 1000000) return (v / 1000000).toFixed(1) + 'M'
  if (v >= 1000) return (v / 1000).toFixed(1) + 'K'
  return Number(v).toFixed(0)
}
