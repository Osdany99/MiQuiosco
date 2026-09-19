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

// Normaliza entradas numéricas de formularios: '', null, undefined o NaN → 0.
// Evita que borrar un campo contamine cálculos (NaN se propaga en sumas).
export function normalizarNumero(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// Subtotal de línea de cuadre blindado contra NaN, redondeado a centavos.
export function calcularSubtotalLinea(precio, cantidad) {
  return Math.round(normalizarNumero(precio) * normalizarNumero(cantidad) * 100) / 100
}
