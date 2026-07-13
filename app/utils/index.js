export function fmtPrecio(v) {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'CUP',
    minimumFractionDigits: 0
  }).format(v)
}

export function fmtDate(d) {
  return new Date(d).toLocaleDateString('es-ES')
}

export function calcularSalario(baseSalario, totalVendido) {
  const tramo = Math.floor(totalVendido / 10000)
  const bono = Math.max(0, tramo - 1) * 100
  return baseSalario + bono
}
