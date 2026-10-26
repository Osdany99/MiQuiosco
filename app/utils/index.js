/**
 * Formatea un precio sin el sufijo de moneda.
 *
 * Todos los precios de la app son CUP, así que repetirlo en cada celda solo
 * roba ancho (y en las tablas de columnas estrechas estorba). Los textos donde
 * el monto va suelto en una frase ("Recarga de 500 CUP al 043...") sí lo
 * escriben a mano, porque ahí el número sin unidad se confundiría con una
 * cantidad.
 */
export function fmtPrecio(v) {
  return new Intl.NumberFormat('es-ES', { minimumFractionDigits: 0 }).format(v)
}

export function fmtDate(d) {
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    return new Date(d + 'T12:00:00').toLocaleDateString('es-ES')
  }
  return new Date(d).toLocaleDateString('es-ES')
}

/** Color de badge para el estado de una deuda fiada. */
export function colorEstadoDeuda(estado) {
  return estado === 'pagada' ? 'success' : estado === 'parcial' ? 'warning' : 'info'
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
  // El bono sale siempre en múltiplos de 10. Un 1% exacto deja cifras que no
  // se pagan en efectivo (12 900 vendidos dan 29 de bono) y eso obliga a
  // embolarse al trabajador; bajarlo a 20 deja el número redondo. Lo que sobra
  // queda para el negocio, y un bono menor de 10 se va directo a cero.
  //
  // Se divide en vez de multiplicar por 0.01 a propósito: `x * 0.01` arrastra
  // coma flotante (10000 * 0.01 no es exactamente 100) y el floor de abajo se
  // comería un bono entero.
  const bonoExacto = excedente / 100
  const bono = Math.floor(bonoExacto / 10) * 10
  return base + bono
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
