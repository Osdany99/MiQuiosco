/**
 * app/utils/voice/diagnostico.js — Formateo puro de la traza de voz.
 *
 * La traza vive en memoria en `useVoiceCommand` y solo se comparte pegándola
 * a mano. Nunca se envía al servidor: puede contener texto crudo del dictado.
 */

const RESERVADOS = new Set(['t', 'evento'])

function dosDigitos(n, largo = 2) {
  return String(Math.trunc(Number(n) || 0)).padStart(largo, '0')
}

/** Hora local con milisegundos: `12:03:41.220`. */
export function horaCorta(ts) {
  const d = new Date(Number(ts) || Date.now())
  return `${dosDigitos(d.getHours())}:${dosDigitos(d.getMinutes())}:${dosDigitos(d.getSeconds())}.${dosDigitos(d.getMilliseconds(), 3)}`
}

function valorLegible(valor) {
  if (valor == null) return ''
  if (typeof valor === 'string') {
    return /[\s"]/.test(valor) ? `"${valor}"` : valor
  }
  if (typeof valor === 'number' || typeof valor === 'boolean') return String(valor)
  try {
    return JSON.stringify(valor)
  } catch {
    return String(valor)
  }
}

/** Convierte una entrada estructurada en una línea de texto. */
export function formatearEntrada(entrada) {
  if (!entrada || !entrada.evento) return ''
  const campos = Object.entries(entrada)
    .filter(([clave, valor]) => !RESERVADOS.has(clave) && valor !== null && valor !== undefined && valor !== '')
    .map(([clave, valor]) => `${clave}=${valorLegible(valor)}`)
  const sufijo = campos.length ? ` ${campos.join(' ')}` : ''
  return `[${horaCorta(entrada.t)}] ${entrada.evento}${sufijo}`
}

/** Traza completa como texto plano (una línea por evento). */
export function formatearTraza(entradas = []) {
  return (Array.isArray(entradas) ? entradas : [])
    .map(formatearEntrada)
    .filter(Boolean)
    .join('\n')
}

/** Contadores útiles para el resumen que se muestra en Ajustes. */
export function resumirTraza(entradas = []) {
  const resumen = { intentos: 0, resultados: 0, errores: 0, rescates: 0, porCodigo: {}, porVariante: {} }
  for (const entrada of Array.isArray(entradas) ? entradas : []) {
    if (!entrada || !entrada.evento) continue
    if (entrada.evento === 'stt.start') {
      resumen.intentos += 1
      const variante = String(entrada.variante || 'sin_variante')
      resumen.porVariante[variante] = (resumen.porVariante[variante] || 0) + 1
    } else if (entrada.evento === 'stt.result') {
      resumen.resultados += 1
    } else if (entrada.evento === 'stt.error') {
      resumen.errores += 1
      const codigo = entrada.code == null ? 'sin_codigo' : String(entrada.code)
      resumen.porCodigo[codigo] = (resumen.porCodigo[codigo] || 0) + 1
    } else if (entrada.evento === 'stt.rescue') {
      resumen.rescates += 1
    }
  }
  return resumen
}

/** Línea de resumen legible; vacía si no hay actividad. */
export function formatearResumen(resumen) {
  if (!resumen || (!resumen.intentos && !resumen.errores && !resumen.rescates)) {
    return 'Sin actividad de voz registrada.'
  }
  const codigos = Object.entries(resumen.porCodigo || {})
    .map(([codigo, n]) => `${codigo}×${n}`)
    .join(' ') || '—'
  const variantes = Object.entries(resumen.porVariante || {})
    .map(([variante, n]) => `${variante}×${n}`)
    .join(' ') || '—'
  return `Intentos: ${resumen.intentos} · Resultados: ${resumen.resultados} · Errores: ${resumen.errores} · Rescates: ${resumen.rescates} · Códigos: ${codigos} · Variantes: ${variantes}`
}

/**
 * Fusiona dos trazas y elimina duplicados (mismo instante, evento e intento).
 * Se usa al mezclar el buffer nativo con el registro de JS.
 */
export function fusionarTrazas(actual = [], nuevas = [], max = 1000) {
  const mapa = new Map()
  for (const entrada of [...(Array.isArray(actual) ? actual : []), ...(Array.isArray(nuevas) ? nuevas : [])]) {
    if (!entrada || !entrada.evento) continue
    const clave = `${entrada.t || 0}|${entrada.evento}|${entrada.inst || ''}|${entrada.intento ?? ''}`
    mapa.set(clave, entrada)
  }
  return Array.from(mapa.values())
    .sort((a, b) => (Number(a.t) || 0) - (Number(b.t) || 0))
    .slice(-Math.max(1, Number(max) || 1000))
}
