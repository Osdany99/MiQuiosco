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

export function camelToSnake(str) {
  return str.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`)
}

export function snakeToCamel(str) {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
}

export function snakeToCamelRow(row) {
  const out = {}
  for (const [k, v] of Object.entries(row || {})) out[snakeToCamel(k)] = v
  return out
}

export function camelToSnakeRow(row) {
  const out = {}
  for (const [k, v] of Object.entries(row || {})) out[camelToSnake(k)] = v
  return out
}

export function tablaDesdeUrl(url) {
  return url.split('/').filter(Boolean).pop() || 'unknown'
}

export function calcularSalario(baseSalario, totalVendido) {
  const tramo = Math.floor(totalVendido / 10000)
  const bono = Math.max(0, tramo - 1) * 100
  return baseSalario + bono
}
