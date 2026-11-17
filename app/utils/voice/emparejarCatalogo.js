import { combinarConfianza } from '../../../shared/voz/gramatica.js'
import { aliasCoincide, aplicarAlias } from '../../../shared/voz/alias.js'
import { fuzzyMatchProducts } from './fuzzyMatchProducts.js'

/**
 * Construye un emparejador a partir de un catálogo, la confianza del STT y los
 * alias aprendidos. El emparejador recibe un hint textual y devuelve candidatos
 * ordenados por `scoreEfectivo`.
 *
 * Los alias pueden **introducir** un producto que el fuzzy no encontró («bombi»
 * no se parece a «Bombillo LED»), y en ese caso sube como casi exacto. Aun así
 * pasa por el umbral, el margen y la confirmación.
 *
 * Forma: `{ product, score, row, scoreEfectivo }`, sin candidatos nulos.
 */
export function crearEmparejador(catalogo, sttConfidence, aliases = []) {
  const cat = Array.isArray(catalogo) ? catalogo : []
  return (hint) => {
    const base = cat.map(f => ({
      id: f.productoId ?? f.id,
      name: f.nombre ?? f.name,
      canonicalSpeak: f.nombre ?? f.name,
      description: f.descripcion ?? f.description
    }))
    const encontrados = fuzzyMatchProducts(hint, base)
      .map((c) => {
        const row = cat.find(f => (f.productoId ?? f.id) === c.product.id)
        if (!row) return null
        return { ...c, row }
      })
      .filter(Boolean)

    // Un alias puede meter en la lista un producto que el fuzzy no vio. Si el
    // mismo texto apunta a dos productos, no se usa: es un conflicto.
    const objetivos = new Set(
      (aliases ?? [])
        .filter(a => aliasCoincide(hint, a?.texto))
        .map(a => String(a.productoId ?? ''))
        .filter(Boolean)
    )
    if (objetivos.size === 1) {
      for (const alias of aliases ?? []) {
        if (!aliasCoincide(hint, alias?.texto)) continue
        const row = cat.find(f => (f.productoId ?? f.id) === alias.productoId)
        if (!row) continue
        const id = row.productoId ?? row.id
        const ya = encontrados.find(c => (c.row.productoId ?? c.row.id) === id)
        if (ya) ya.score = Math.max(1, Number(ya.score) || 0)
        else encontrados.push({ product: { id, name: row.nombre ?? '' }, score: 1, row, alias: true })
      }
    }

    return aplicarAlias(encontrados, hint, aliases)
      .map(c => ({ ...c, scoreEfectivo: combinarConfianza(c.score, sttConfidence) }))
      .sort((a, b) => b.scoreEfectivo - a.scoreEfectivo)
  }
}
