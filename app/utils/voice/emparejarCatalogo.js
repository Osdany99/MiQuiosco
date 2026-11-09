import { combinarConfianza } from '#shared/voz/gramatica'
import { fuzzyMatchProducts } from './fuzzyMatchProducts'

/**
 * Construye un emparejador a partir de un catálogo de inventario y la confianza
 * del STT. El emparejador recibe un hint textual y devuelve candidatos ordenados
 * por `scoreEfectivo`.
 *
 * Forma: `{ product, score, row, scoreEfectivo }`, sin candidatos nulos.
 */
export function crearEmparejador(catalogo, sttConfidence) {
  const cat = Array.isArray(catalogo) ? catalogo : []
  return (hint) => {
    const base = cat.map(f => ({
      id: f.productoId ?? f.id,
      name: f.nombre ?? f.name,
      canonicalSpeak: f.nombre ?? f.name,
      description: f.descripcion ?? f.description
    }))
    return fuzzyMatchProducts(hint, base)
      .map((c) => {
        const row = cat.find(f => (f.productoId ?? f.id) === c.product.id)
        if (!row) return null
        return { ...c, row, scoreEfectivo: combinarConfianza(c.score, sttConfidence) }
      })
      .filter(Boolean)
  }
}
