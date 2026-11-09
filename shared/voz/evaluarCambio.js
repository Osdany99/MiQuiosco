import { resolverComando } from './gramatica.js'
import { crearLexico } from './lexico.js'

function prepararPlantilla(plantilla) {
  return String(plantilla ?? '')
    .replace(/<n>/g, 'cinco')
    .replace(/<producto>/g, 'pan')
    .replace(/<cliente>/g, 'juan')
}

export function evaluarCambio(lexicoBase, entrada, { frasesDoradas = [], plantillas = [] } = {}) {
  const lexicoCon = crearLexico(lexicoBase, entrada ? [entrada] : [])
  const regresiones = []
  for (const f of frasesDoradas) {
    const antes = resolverComando(f.frase, lexicoBase).comando
    const despues = resolverComando(f.frase, lexicoCon).comando
    if (antes !== despues) regresiones.push({ frase: f.frase, antes, despues })
  }
  const cambios = []
  for (const p of plantillas) {
    const texto = prepararPlantilla(p)
    if (!texto) continue
    const antes = resolverComando(texto, lexicoBase).comando
    const despues = resolverComando(texto, lexicoCon).comando
    if (antes !== despues) cambios.push({ plantilla: p, antes, despues })
  }
  return { regresiones, cambios }
}
