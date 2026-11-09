import { z } from 'zod'

import { VISTAS_CON_RUTA } from '../permisos.js'

export const CATEGORIAS_LEXICO = [
  'venta_fuerte',
  'venta_debil',
  'navegacion_verbo',
  'navegacion_complemento',
  'consulta_marca',
  'navegacion_destino'
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
  navegacion_verbo: 'navegacionVerbo',
  navegacion_complemento: 'navegacionComplemento',
  consulta_marca: 'consultaMarca',
  navegacion_destino: 'destinos'
}

export const lexicoEntradaSchema = z.object({
  categoria: z.enum(CATEGORIAS_LEXICO),
  valor: z.string().regex(/^[a-z]{2,24}$/u, 'Valor inválido'),
  clave: z.string().nullable().optional(),
  activo: z.boolean().optional().default(true)
})

const DESTINOS_VALIDOS = new Set((VISTAS_CON_RUTA || []).map(v => v.key))

function normalizarLexicoEfectivo(lexicoEfectivo) {
  // Se admite un array de entradas o un léxico compuesto.
  if (Array.isArray(lexicoEfectivo)) return lexicoEfectivo
  if (!lexicoEfectivo || typeof lexicoEfectivo !== 'object') return []
  const out = []
  for (const cat of CATEGORIAS_LEXICO) {
    const campo = CATEGORIA_A_CAMPO[cat]
    if (cat !== 'navegacion_destino') {
      for (const v of lexicoEfectivo[campo] || []) out.push({ categoria: cat, valor: v, activo: true })
    } else {
      const destinos = lexicoEfectivo.destinos || {}
      for (const [clave, palabras] of Object.entries(destinos)) {
        for (const v of palabras || []) out.push({ categoria: cat, valor: v, clave, activo: true })
      }
    }
  }
  return out
}

export function validarEntrada(entrada, lexicoEfectivo = []) {
  const parsed = lexicoEntradaSchema.safeParse(entrada)
  if (!parsed.success) return { ok: false, motivo: 'formato' }

  const { categoria, valor, clave } = parsed.data
  if (PALABRAS_RESERVADAS.has(valor)) return { ok: false, motivo: 'palabra_reservada' }

  if (categoria === 'navegacion_destino') {
    if (!clave || !DESTINOS_VALIDOS.has(clave)) return { ok: false, motivo: 'destino_invalido' }
  } else if (clave) {
    return { ok: false, motivo: 'clave_inesperada' }
  }

  const efectivo = normalizarLexicoEfectivo(lexicoEfectivo)
  // Conflicto: la misma palabra en otra categoría.
  const categoriasDeValor = new Set(
    efectivo.filter(e => e.activo !== false && e.valor === valor).map(e => e.categoria)
  )
  if (categoriasDeValor.size > 0 && !categoriasDeValor.has(categoria)) {
    return { ok: false, motivo: 'conflicto_categoria' }
  }
  // Conflicto: otra clave para el mismo destino del léxic.
  if (categoria === 'navegacion_destino') {
    const clavesExistentes = new Set(
      efectivo
        .filter(e => e.activo !== false && e.valor === valor && e.categoria === categoria)
        .map(e => e.clave)
    )
    if (clavesExistentes.size && !clavesExistentes.has(clave)) return { ok: false, motivo: 'conflicto_clave' }
  }

  return { ok: true }
}
