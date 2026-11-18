import { z } from 'zod'

/**
 * Categorías del léxico remoto. Las de navegación se retiraron junto con ese
 * comando: ahora todo lo que se reconoce es una acción o una consulta.
 */
export const CATEGORIAS_LEXICO = [
  'venta_fuerte',
  'venta_debil',
  'fiado_verbo',
  'fiado_venta_verbo',
  'cobro_verbo',
  'cobro_marca',
  'consulta_marca',
  'precio_marca',
  'deuda_marca',
  'entrada_verbo',
  'precio_verbo',
  'traspaso_verbo',
  'transferencia_verbo',
  'merma_verbo',
  'devolucion_verbo',
  'alta_verbo',
  'mover_verbo',
  'cuadre_abrir',
  'cuadre_cerrar'
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
  fiado_verbo: 'fiadoVerbo',
  fiado_venta_verbo: 'fiadoVentaVerbo',
  cobro_verbo: 'cobroVerbo',
  cobro_marca: 'cobroMarca',
  consulta_marca: 'consultaMarca',
  precio_marca: 'precioMarca',
  deuda_marca: 'deudaMarca',
  entrada_verbo: 'entradaVerbo',
  precio_verbo: 'precioVerbo',
  traspaso_verbo: 'traspasoVerbo',
  transferencia_verbo: 'transferenciaVerbo',
  merma_verbo: 'mermaVerbo',
  devolucion_verbo: 'devolucionVerbo',
  alta_verbo: 'altaVerbo',
  mover_verbo: 'moverVerbo',
  cuadre_abrir: 'cuadreAbrir',
  cuadre_cerrar: 'cuadreCerrar'
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

export function validarEntrada(entrada, lexicoEfectivo = [], baseEntries = []) {
  const parsed = lexicoEntradaSchema.safeParse(entrada)
  if (!parsed.success) return { ok: false, motivo: 'formato' }

  const { categoria, valor, activo } = parsed.data
  // Un tombstone no añade vocabulario: solo retira una palabra de su
  // categoría. Se permite incluso si la palabra base es «reservada».
  if (activo === false) return { ok: true }

  const efectivo = normalizarLexicoEfectivo(lexicoEfectivo)
  const existente = efectivo.some(
    e => e.activo !== false && e.categoria === categoria && e.valor === valor
  )
  if (PALABRAS_RESERVADAS.has(valor) && !existente) {
    return { ok: false, motivo: 'palabra_reservada' }
  }

  // Conflicto: la misma palabra en otra categoría. Una palabra que ya existe
  // en el léxico base puede reasignarse a otro flujo (se muestra el solape en
  // el panel); el conflicto solo frena sinónimos nuevos y ambiguos.
  const categoriasDeValor = new Set(
    efectivo.filter(e => e.activo !== false && e.valor === valor).map(e => e.categoria)
  )
  const enBase = baseEntries.some(e => e.valor === valor)
  if (categoriasDeValor.size > 0 && !categoriasDeValor.has(categoria) && !enBase) {
    return { ok: false, motivo: 'conflicto_categoria' }
  }

  return { ok: true }
}
