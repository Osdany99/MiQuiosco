import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { UMBRAL_PRODUCTO, resolverComando } from '../shared/voz/gramatica.js'
import { fuzzyMatchProducts } from '../app/utils/voice/fuzzyMatchProducts.js'
import { decidirVentaDebil, esRazonDebil } from '../app/utils/voice/decisionDebil.js'

/** Las 22 frases de charla del Apéndice A del plan. Ninguna es un comando. */
export const CHARLA = [
  'hola', 'buenas tardes', 'ya voy', 'dame un momento', 'pasame la bolsa', 'tengo dos hijos',
  'son las cinco', 'hace tres dias', 'el cliente quiere dos', 'cinco minutos y vuelvo',
  'tengo veinte pesos', 'que calor hace hoy', 'anota mi telefono', 'manana vienen dos camiones',
  'pon la radio', 'baja el volumen', 'saca la basura', 'cobra ya que me voy', 'dame la bolsa',
  'abre la ventana', 'cierra la puerta', 'me quedan dos horas'
]

/** Catálogo mínimo del mostrador: lo que sí se vende. */
const CATALOGO = [
  { id: 'pan', name: 'Pan', description: 'de leche' },
  { id: 'refresco', name: 'Refresco', description: 'cola' },
  { id: 'azucar', name: 'Azúcar', description: 'refinada' },
  { id: 'huevo', name: 'Huevo', description: null },
  { id: 'mani-molido', name: 'Maní', description: 'molido' },
  { id: 'mani-cocinado', name: 'Maní', description: 'cocinado' }
]

/** Qué haría el flujo real con una frase: comando, y si es venta débil, veredicto. */
function decidir(frase) {
  const r = resolverComando(frase)
  if (r.comando !== 'venta_directa') return { comando: r.comando, debil: false }
  const debil = esRazonDebil(r.reasons)
  if (!debil) return { comando: r.comando, debil: false }
  const candidatos = fuzzyMatchProducts(frase, CATALOGO)
  const veredicto = decidirVentaDebil({
    candidatos,
    umbral: UMBRAL_PRODUCTO,
    sttConfidence: 0.9,
    hint: { nombre: candidatos[0]?.product?.name, cantidad: 1 }
  })
  return { comando: r.comando, debil: true, veredicto: veredicto.tipo }
}

describe('voz: charla no se vende (F5.3)', () => {
  it('ninguna frase de charla termina en una venta', () => {
    const malas = []
    for (const frase of CHARLA) {
      const d = decidir(frase)
      // Se cuenta como falso positivo cualquier cosa que no sea silencio.
      const esFalso = d.comando !== 'desconocido' && d.veredicto !== 'ignorar'
      if (esFalso) malas.push({ frase, comando: d.comando, veredicto: d.veredicto ?? null })
    }
    // Meta del plan: ≤ 4 de 22.
    assert.ok(malas.length <= 4, `charla falsos ${malas.length}/22: ${JSON.stringify(malas, null, 2)}`)
  })

  it('«dame la bolsa» no se pregunta: no se parece a nada del catálogo', () => {
    const d = decidir('dame la bolsa')
    assert.equal(d.veredicto, 'ignorar', 'preguntar «¿Quisiste vender bolsa?» es ruido')
  })

  it('las frases de charla que sí canta el intérprete dan el veredicto esperado', () => {
    // Se comprueba caso a caso para que el fallo del ratchet diga CUÁL se coló.
    // Solo entran las de señal débil (las que F5 cubre). Quedan 3 falsos de
    // verbo fuerte —«saca la basura», «anota mi telefono», «cobra ya que me
    // voy»— que F5 no aborda a propósito (el plan lo acota a verbo débil): el
    // presupuesto de ≤4 de 22 los admite.
    const esperados = {
      'dame un momento': 'ignorar',
      'son las cinco': 'ignorar',
      'hace tres dias': 'ignorar',
      'el cliente quiere dos': 'ignorar',
      'cinco minutos y vuelvo': 'ignorar',
      'manana vienen dos camiones': 'ignorar',
      'dame la bolsa': 'ignorar'
    }
    const fallos = []
    for (const [frase, esperado] of Object.entries(esperados)) {
      const d = decidir(frase)
      if (d.veredicto !== esperado) fallos.push({ frase, esperado, obtenido: d.veredicto ?? d.comando })
    }
    assert.deepEqual(fallos, [], `charla que no se calla:\n${JSON.stringify(fallos, null, 2)}`)
  })

  it('«tengo dos hijos» no es una consulta de stock', () => {
    assert.equal(resolverComando('tengo dos hijos').comando, 'desconocido')
    assert.equal(resolverComando('tengo veinte pesos').comando, 'desconocido')
    assert.equal(resolverComando('me quedan dos horas').comando, 'desconocido')
  })
})

describe('voz: la venta débil legítima sigue vendiendo', () => {
  // «cinco panes» sin verbo es el dictado más natural del mostrador: no puede
  // caer en la red de seguridad.
  it('«cinco panes» vende', () => {
    const d = decidir('cinco panes')
    assert.equal(d.debil, true)
    assert.equal(d.veredicto, 'vender')
  })

  it('«dos refrescos» vende', () => {
    assert.equal(decidir('dos refrescos').veredicto, 'vender')
  })

  it('un cliente dudoso pregunta en vez de vender', () => {
    const candidatos = [
      { product: { id: 'a', name: 'Pan' }, score: 0.8, row: { nombre: 'Pan' } },
      { product: { id: 'b', name: 'Pan' }, score: 0.8, row: { nombre: 'Pan' } }
    ]
    const v = decidirVentaDebil({
      candidatos,
      umbral: UMBRAL_PRODUCTO,
      sttConfidence: 0,
      hint: { nombre: 'Pan', cantidad: 2 }
    })
    assert.equal(v.tipo, 'aclarar')
    assert.match(v.pregunta, /¿Quisiste vender 2 Pan\?/)
  })

  it('sin candidatos se ignora en vez de dar error', () => {
    assert.equal(decidirVentaDebil({ candidatos: [], umbral: UMBRAL_PRODUCTO }).tipo, 'ignorar')
  })
})

describe('voz: consultas de stock que sí lo son', () => {
  it('las marcas fuertes siguen siendo consulta', () => {
    for (const frase of ['cuanto hay de pan', 'cuanta azucar queda', 'que stock tienes de refresco']) {
      assert.equal(resolverComando(frase).comando, 'consulta_stock', frase)
    }
  })
})
