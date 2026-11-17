import { z } from 'zod'

/**
 * Categorías del léxico remoto. Las de navegación se retiraron junto con ese
 * comando: ahora todo lo que se reconoce es una acción o una consulta.
 */
export const CATEGORIAS_LEXICO = [
  'venta_fuerte',
  'venta_debil',
  'consulta_marca'
]

export const PALABRAS_RESERVADAS = new Set([
  'cero', 'un', 'uno', 'una', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
  'diez', 'mil', 'docena', 'docenas', 'media',
  'de', 'del', 'el', 'la', 'los', 'las', 'un', 'una', 'con', 'sin', 'en', 'al', 'para', 'por', 'favor',
  'quiosco', 'kiosco', 'almacen', 'regalo', 'familiar', 'casa', 'normal',
  'inventario'
])

const CATEGORIA_A_CAMPO = {
  venta_fuerte: 'ventaFuerte',
  venta_debil: 'ventaDebil',
  consulta_marca: 'consultaMarca'
}

export const lexicoEntradaSchema = z.object({
  categoria: z.enum(CATEGORIAS_LEXICO),
  valor: z.string().regex(/^[a-z]{2,24}$/u, 'Valor inválido'),
  activo: z.boolean().optional().default(true)
})

function normalizarLexicoEfectivo(lexicoEfectivo) {
  // Se admite un array de entradas o un léxico compuesto.
  if (Array.isArray(lexicoEfectivo)) return lexicoEfectivo
  if (!lexicoEfectivo || typeof lexicoEfectivo !== 'object') return []
  const out = []
  for (const cat of CATEGORIAS_LEXICO) {
    const campo = CATEGORIA_A_CAMPO[cat]
    for (const v of lexicoEfectivo[campo] || []) out.push({ categoria: cat, valor: v, activo: true })
  }
  return out
}

export function validarEntrada(entrada, lexicoEfectivo = []) {
  const parsed = lexicoEntradaSchema.safeParse(entrada)
  if (!parsed.success) return { ok: false, motivo: 'formato' }

  const { categoria, valor } = parsed.data
  if (PALABRAS_RESERVADAS.has(valor)) return { ok: false, motivo: 'palabra_reservada' }

  const efectivo = normalizarLexicoEfectivo(lexicoEfectivo)
  // Conflicto: la misma palabra en otra categoría.
  const categoriasDeValor = new Set(
    efectivo.filter(e => e.activo !== false && e.valor === valor).map(e => e.categoria)
  )
  if (categoriasDeValor.size > 0 && !categoriasDeValor.has(categoria)) {
    return { ok: false, motivo: 'conflicto_categoria' }
  }

  return { ok: true }
}
