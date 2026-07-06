export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

export function randomFrom(array) {
  return array[Math.floor(Math.random() * array.length)]
}

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
