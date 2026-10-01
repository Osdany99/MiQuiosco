export function fmtPrecio(v) {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'CUP',
    minimumFractionDigits: 0
  }).format(v)
}

export function fmtDate(d) {
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    return new Date(d + 'T12:00:00').toLocaleDateString('es-ES')
  }
  return new Date(d).toLocaleDateString('es-ES')
}

export function hoyLocal() {
  const d = new Date()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}

// El bono es del 1% solo de lo vendido POR ENCIMA de este umbral: los
// primeros 10 000 del día no cuentan. Un día flojo deja el bono en cero y el
// trabajador cobra su base, en vez de cobrar un extra por ventas que no hubo.
export const UMBRAL_BONO_SALARIO = 10000

export function calcularSalario(baseSalario, totalVendido) {
  const base = normalizarNumero(baseSalario)
  const excedente = Math.max(0, normalizarNumero(totalVendido) - UMBRAL_BONO_SALARIO)
  return Math.round(base + excedente * 0.01)
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
