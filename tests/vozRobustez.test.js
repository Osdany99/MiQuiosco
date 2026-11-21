import test from 'node:test'
import assert from 'node:assert/strict'
import { resolverComando, extraerSlots } from '../shared/voz/gramatica.js'
import { FRASES_DORADAS } from '../shared/voz/frasesDoradas.js'

// Ratchet: SUBIR tras cada fase, nunca bajar. Línea base medida: 0.72 / 0.33 / 14.
// (El valor medido de slots es 0.3287; el umbral se deja en 0.32 para no
// redondear hacia arriba una cifra que no se alcanza.)
// Tras F1 (limpieza): intención 100%, slots 77%, charla 13/22.
const MIN_INTENCION = 1.0
const MIN_SLOTS = 0.76
const MAX_CHARLA_FALSOS = 13

function interpretar(f) {
  const r = resolverComando(f)
  let s = {}
  try {
    s = extraerSlots(r.comando, f) ?? {}
  } catch {
    s = { _error: true }
  }
  const limpio = {}
  for (const k of Object.keys(s).sort()) limpio[k] = s[k]
  return { comando: r.comando, slots: JSON.stringify(limpio) }
}

const W2D = { dos: '2', tres: '3', cuatro: '4', cinco: '5', seis: '6', siete: '7', ocho: '8', nueve: '9', diez: '10', veinte: '20' }
const D2W = Object.fromEntries(Object.entries(W2D).map(([w, d]) => [d, w]))
const aDigitos = f => f.split(' ').map(t => W2D[t] ?? t).join(' ')
const aPalabras = f => f.split(' ').map(t => D2W[t] ?? t).join(' ')
const medio = (f, x) => {
  const [v, ...r] = f.split(' ')
  return [v, x, ...r].join(' ')
}

const PERTURBACIONES = {
  'prefijo oye': f => `oye ${f}`,
  'prefijo mira': f => `mira ${f}`,
  'prefijo por favor': f => `por favor ${f}`,
  'prefijo ahora': f => `ahora ${f}`,
  'prefijo a ver': f => `a ver ${f}`,
  'prefijo bueno': f => `bueno ${f}`,
  'sufijo por favor': f => `${f} por favor`,
  'sufijo gracias': f => `${f} gracias`,
  'sufijo ya': f => `${f} ya`,
  'sufijo ahora': f => `${f} ahora`,
  'por favor tras el verbo': f => medio(f, 'por favor'),
  'verbo repetido': f => medio(f, f.split(' ')[0]),
  'quiosco a kiosco': f => f.replace(/quiosco/g, 'kiosco'),
  'cifras y palabras': (f) => {
    const a = aDigitos(f)
    return a !== f ? a : aPalabras(f)
  }
}

export const CHARLA = [
  'hola', 'buenas tardes', 'ya voy', 'dame un momento', 'pasame la bolsa', 'tengo dos hijos',
  'son las cinco', 'hace tres dias', 'el cliente quiere dos', 'cinco minutos y vuelvo',
  'tengo veinte pesos', 'que calor hace hoy', 'anota mi telefono', 'manana vienen dos camiones',
  'pon la radio', 'baja el volumen', 'saca la basura', 'cobra ya que me voy', 'dame la bolsa',
  'abre la ventana', 'cierra la puerta', 'me quedan dos horas'
]

function medir() {
  const base = FRASES_DORADAS.map(({ frase, comando }) => ({ frase, comando, ...interpretar(frase) }))
  let n = 0, okI = 0, okS = 0
  for (const b of base) {
    for (const fn of Object.values(PERTURBACIONES)) {
      const v = fn(b.frase)
      if (v === b.frase) continue
      n++
      const r = interpretar(v)
      if (r.comando === b.comando) {
        okI++
        if (r.slots === b.slots) okS++
      }
    }
  }
  const falsos = CHARLA.filter(f => resolverComando(f).comando !== 'desconocido').length
  return { base, n, intencion: okI / n, slots: okS / n, falsos }
}

test('las frases doradas sin perturbar son correctas', () => {
  for (const b of medir().base) assert.equal(b.comando, FRASES_DORADAS.find(x => x.frase === b.frase).comando, b.frase)
})

test('robustez: intencion y slots ante muletillas, cortesias y variantes', () => {
  const m = medir()
  console.log(`variantes=${m.n} intencion=${(m.intencion * 100).toFixed(0)}% slots=${(m.slots * 100).toFixed(0)}% charla_falsos=${m.falsos}/${CHARLA.length}`)
  assert.ok(m.intencion >= MIN_INTENCION, `intencion ${m.intencion} < ${MIN_INTENCION}`)
  assert.ok(m.slots >= MIN_SLOTS, `slots ${m.slots} < ${MIN_SLOTS}`)
  assert.ok(m.falsos <= MAX_CHARLA_FALSOS, `charla falsos ${m.falsos} > ${MAX_CHARLA_FALSOS}`)
})
