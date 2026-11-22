/**
 * shared/voz/limpieza.js - limpieza de muletillas y cortesías (Fase 6, F1).
 *
 * Puro: sin Vue, sin Capacitor, sin base de datos. Se prueba con
 * `node --test` (tests/vozLimpieza.test.js).
 *
 * Entrada: texto ya normalizado (minúsculas, sin puntuación de extremos).
 * Salida: { texto, quitadas } donde `quitadas` lista lo que se quitó.
 *
 * Regla dura: no toca nada dentro del tramo de producto. "pan con ya" se queda
 * igual; "vende dos panes por favor" pierde el "por favor".
 */

import { VOZ_LIMPIEZA_ACTIVA } from './config.js'

const LEADING_FILLERS = ['oye nova', 'por favor', 'a ver', 'bueno', 'mira', 'oye', 'ahora', 'gracias']

const TRAILING_FILLERS = ['por favor', 'gracias', 'ya', 'ahora']

const PREPOSICIONES = new Set(['con', 'de', 'del', 'y', 'al', 'para', 'a', 'el', 'la', 'un', 'los', 'las', 'en', 'del'])

function quitarPrefijo(texto, quitadas) {
  let t = texto
  let cambio = true
  while (cambio) {
    cambio = false
    for (const f of LEADING_FILLERS) {
      if (t === f) break
      if (t.startsWith(f + ' ')) {
        t = t.slice(f.length).trim()
        quitadas.push(f)
        cambio = true
        break
      }
    }
  }
  return t
}

function quitarSufijo(texto, quitadas) {
  let t = texto
  let cambio = true
  while (cambio && t) {
    cambio = false
    for (const f of TRAILING_FILLERS) {
      if (t === f) break
      if (t.endsWith(' ' + f)) {
        const antes = t.slice(0, t.length - f.length - 1).trim()
        const ultimo = antes.split(' ').pop()
        // No comer un filler que sea parte del producto ("pan con ya").
        if (ultimo && PREPOSICIONES.has(ultimo)) break
        t = antes
        quitadas.push(f)
        cambio = true
        break
      }
    }
  }
  return t
}

function quitarCortesiaTrasVerbo(texto, quitadas) {
  const tokens = texto.split(' ').filter(Boolean)
  if (tokens.length < 2) return texto
  // El verbo es el primer token. Si los siguientes son "por favor", se quitan.
  let i = 1
  while (i < tokens.length) {
    if (tokens[i] === 'por' && tokens[i + 1] === 'favor') {
      tokens.splice(i, 2)
      quitadas.push('por favor')
      // no avanzar: puede haber otra
    } else {
      break
    }
  }
  return tokens.join(' ').trim()
}

function colapsarTartamudeo(texto, quitadas) {
  const tokens = texto.split(' ').filter(Boolean)
  const out = []
  for (const tk of tokens) {
    if (out.length > 0 && out[out.length - 1] === tk) {
      quitadas.push(tk)
      continue
    }
    out.push(tk)
  }
  return out.join(' ').trim()
}

/**
 * ¿La limpieza está activa? `?vozLimpieza=0` la apaga y `?vozLimpieza=1` la
 * enciende, para probar el rollback en el teléfono en 2 segundos (F1.4).
 *
 * Solo la pantalla manda: en la app cerrada no hay query string y vale la
 * constante del bundle. Se lee `window` de forma defensiva para que el módulo
 * siga siendo puro y probable con `node --test`.
 */
export function limpiezaActiva() {
  try {
    const valor = typeof window === 'undefined'
      ? null
      : new URLSearchParams(window.location?.search ?? '').get('vozLimpieza')
    if (valor === '0') return false
    if (valor === '1') return true
  } catch {
    // Sin `window` (SSR, tests, servicio nativo): manda la constante.
  }
  return VOZ_LIMPIEZA_ACTIVA
}

export function limpiarFrase(textoNormalizado, activa = limpiezaActiva()) {
  const texto = String(textoNormalizado ?? '').trim()
  if (!activa) return { texto, quitadas: [] }
  if (!texto) return { texto: '', quitadas: [] }

  const quitadas = []
  let t = quitarPrefijo(texto, quitadas)
  t = quitarCortesiaTrasVerbo(t, quitadas)
  t = quitarSufijo(t, quitadas)
  t = colapsarTartamudeo(t, quitadas)
  if (!t) t = texto
  return { texto: t, quitadas }
}
