import { registerPlugin } from '@capacitor/core'

/**
 * PILOTO de voz offline (Vosk). Envoltorio aislado: no lo usa ningún flujo de
 * la app. Si el piloto se descarta, se borra este archivo, la página
 * `laboratorio-voz.vue`, el plugin Java y el asset del modelo.
 */
export const VoskPilot = registerPlugin('VoskPilot')

export const FRASES_PILOTO = [
  { id: 'f1', texto: 'vende dos refrescos', nota: 'venta simple' },
  { id: 'f2', texto: 'vende cinco panes del almacén', nota: 'cantidad + ubicación' },
  { id: 'f3', texto: 'cuánto hay de maní', nota: 'consulta de stock' },
  { id: 'f4', texto: 'abre cuadre', nota: 'navegación' },
  { id: 'f5', texto: 'vende un refresco familiar', nota: 'nombre compuesto' },
  { id: 'f6', texto: 'hola', nota: 'control: no es comando' },
  { id: 'f7', texto: 'vende veinte refrescos', nota: 'número difícil' },
  { id: 'f8', texto: 'cuánto queda de pan', nota: 'consulta con sinónimo' },
  { id: 'f9', texto: 'vende tres galletas', nota: 'otro producto' },
  { id: 'f10', texto: 'abre las deudas', nota: 'navegación plural' }
]

const IGNORADOS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'de', 'del', 'al', 'a', 'y', 'que', 'hay', 'esta', 'estan'
])

const NUMEROS = {
  0: 'cero', 1: 'uno', 2: 'dos', 3: 'tres', 4: 'cuatro', 5: 'cinco',
  6: 'seis', 7: 'siete', 8: 'ocho', 9: 'nueve', 10: 'diez',
  11: 'once', 12: 'doce', 13: 'trece', 14: 'catorce', 15: 'quince',
  16: 'dieciseis', 17: 'diecisiete', 18: 'dieciocho', 19: 'diecinueve',
  20: 'veinte', 30: 'treinta', 40: 'cuarenta', 50: 'cincuenta',
  100: 'cien'
}

/** Minúsculas, sin tildes, sin signos y con espacios simples. */
export function normalizarPiloto(texto) {
  return String(texto ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9ñü\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokens(texto) {
  return normalizarPiloto(texto)
    .split(' ')
    .filter(Boolean)
    .map(t => (NUMEROS[t] ? NUMEROS[t] : t))
}

/**
 * Compara la frase esperada con la transcripción.
 * `ok` exige todas las palabras significativas (ignora artículos y
 * preposiciones, que el motor puede omitir sin cambiar el comando).
 */
export function evaluarTranscripcion(esperado, obtenido) {
  const esperados = tokens(esperado)
  const obtenidos = tokens(obtenido)
  const setObtenido = new Set(obtenidos)
  const faltan = esperados.filter(t => !setObtenido.has(t))
  const significativos = esperados.filter(t => !IGNORADOS.has(t))
  const faltanClave = significativos.filter(t => !setObtenido.has(t))
  const sobran = obtenidos.filter(t => !esperados.includes(t))
  return {
    ok: significativos.length > 0 && faltanClave.length === 0,
    ratio: significativos.length ? (significativos.length - faltanClave.length) / significativos.length : 0,
    faltan,
    faltanClave,
    sobran
  }
}

function limpiar(texto, max = 200) {
  return String(texto ?? '')
    .replace(/\s+/g, ' ')
    .replace(/"/g, '\'')
    .trim()
    .slice(0, max)
}

function segundos(ms) {
  return (Number(ms) || 0) / 1000
}

/** Informe de texto listo para copiar. */
export function formatearInforme(sesion = [], meta = {}) {
  const tomas = Array.isArray(sesion) ? sesion : []
  const lineas = ['# Piloto Vosk (voz offline)']
  for (const [clave, valor] of Object.entries(meta || {})) {
    if (valor !== undefined && valor !== null && valor !== '') {
      lineas.push(`${clave}=${limpiar(valor, 80)}`)
    }
  }

  let ok = 0
  let bien = 0
  let regular = 0
  let mal = 0
  let sumaDecode = 0
  let sumaAudio = 0

  tomas.forEach((toma, i) => {
    const evaluacion = evaluarTranscripcion(toma.esperado, toma.texto)
    if (evaluacion.ok) ok++
    if (toma.valoracion === 'bien') bien++
    else if (toma.valoracion === 'regular') regular++
    else if (toma.valoracion === 'mal') mal++
    sumaDecode += Number(toma.msDecode) || 0
    sumaAudio += Number(toma.msAudio) || 0
    lineas.push(
      `[${i + 1}] esperado="${limpiar(toma.esperado)}" transcripto="${limpiar(toma.texto)}" `
      + `ok=${evaluacion.ok ? 'si' : 'no'} ratio=${evaluacion.ratio.toFixed(2)} `
      + `valoracion=${toma.valoracion || 'sin_valorar'} `
      + `audio=${segundos(toma.msAudio).toFixed(1)}s decode=${segundos(toma.msDecode).toFixed(1)}s `
      + `conf=${Number(toma.confidence || 0).toFixed(2)} alts=${Number(toma.alternativas || 0)}`
    )
    if (evaluacion.faltanClave.length) {
      lineas.push(`    faltan=${evaluacion.faltanClave.join(',')}`)
    }
  })

  const n = tomas.length
  lineas.push('')
  lineas.push(
    `resumen: ${n} tomas · ${ok} ok (${n ? Math.round(ok * 100 / n) : 0}%) · `
    + `bien ${bien} · regular ${regular} · mal ${mal} · `
    + `decode medio ${n ? (sumaDecode / n / 1000).toFixed(2) : '0.00'}s · `
    + `audio medio ${n ? (sumaAudio / n / 1000).toFixed(2) : '0.00'}s`
  )
  return lineas.join('\n')
}
