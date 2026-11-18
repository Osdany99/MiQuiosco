import { resolverComando, extraerSlots, normalizar } from './gramatica.js'
import { CATEGORIA_A_CAMPO, LEXICO_BASE, crearLexico, entradasLexicoBase } from './lexico.js'
import { validarEntrada } from '../schemas/vozLexico.js'

/**
 * Simulador de «¿qué pasa si añado/retiro esta palabra?» del panel de léxico.
 *
 * Compara la lectura de las frases doradas y de las plantillas del jefe con el
 * léxico actual y con el léxico que resultaría del cambio. No escribe nada.
 *
 * No basta con comparar el comando: la misma venta con otro producto o cantidad
 * ya es un cambio real. `campos` dice qué se movió.
 */

const CAMPOS = ['cantidad', 'producto', 'cliente', 'ubicacion']

function prepararPlantilla(plantilla) {
  return String(plantilla ?? '')
    .replace(/<n>/g, 'cinco')
    .replace(/<producto>/g, 'pan')
    .replace(/<cliente>/g, 'juan')
}

/** Lectura comparable de una frase: comando + los slots que importan. */
function evaluar(frase, lexico) {
  const resultado = resolverComando(frase, lexico)
  const slots = extraerSlots(resultado.comando, frase, lexico) || {}
  return {
    comando: resultado.comando,
    cantidad: slots.cantidad ?? null,
    producto: slots.productoHint ?? slots.nombre ?? '',
    cliente: slots.clienteHint ?? '',
    ubicacion: slots.ubicacion ?? null
  }
}

function valorComparable(valor) {
  return valor == null || valor === '' ? '' : String(valor)
}

/** Campos que cambiaron entre dos lecturas (vacío = no cambió nada). */
function camposCambiados(antes, despues) {
  const campos = []
  if (antes.comando !== despues.comando) campos.push('comando')
  for (const campo of CAMPOS) {
    if (valorComparable(antes[campo]) !== valorComparable(despues[campo])) campos.push(campo)
  }
  return campos
}

function contieneValor(plantilla, valor) {
  const tokens = normalizar(prepararPlantilla(plantilla)).split(' ').filter(Boolean)
  return tokens.includes(valor)
}

/**
 * Por qué una prueba no muestra cambios. Se calcula sobre el léxico efectivo
 * para que el panel pueda explicarlo en vez de dejar dos ceros.
 */
function motivoDe({ entrada, lexicoBase, plantillas }) {
  if (!entrada) return 'sin_entrada'

  // La base real es `LEXICO_BASE`, no el léxico efectivo: si se pasara el
  // efectivo como base, ningún sinónimo nuevo podría detectarse como conflicto
  // de categoría (que es justo lo que el servidor rechaza al guardar).
  const validacion = validarEntrada(entrada, lexicoBase, entradasLexicoBase(LEXICO_BASE))
  if (!validacion.ok) return validacion.motivo

  const campo = CATEGORIA_A_CAMPO[entrada.categoria]
  const lista = Array.isArray(lexicoBase?.[campo]) ? lexicoBase[campo] : []
  const yaEsta = lista.includes(entrada.valor)

  if (entrada.activo === false) return yaEsta ? null : 'no_esta_activa'
  if (yaEsta) return 'ya_existe'
  if (!Array.isArray(plantillas) || !plantillas.some(p => String(p ?? '').trim())) {
    return 'sin_plantillas'
  }
  if (!plantillas.some(p => contieneValor(p, entrada.valor))) return 'ninguna_plantilla_la_usa'
  return null
}

export function evaluarCambio(lexicoBase, entrada, { frasesDoradas = [], plantillas = [] } = {}) {
  const lexicoCon = crearLexico(lexicoBase, entrada ? [entrada] : [])

  const regresiones = []
  for (const f of frasesDoradas) {
    const antes = evaluar(f.frase, lexicoBase)
    const despues = evaluar(f.frase, lexicoCon)
    const campos = camposCambiados(antes, despues)
    if (!campos.length) continue
    regresiones.push({
      frase: f.frase,
      antes: antes.comando,
      despues: despues.comando,
      campos,
      detalleAntes: antes,
      detalleDespues: despues
    })
  }

  const cambios = []
  for (const p of plantillas) {
    const texto = prepararPlantilla(p)
    if (!texto) continue
    const antes = evaluar(texto, lexicoBase)
    const despues = evaluar(texto, lexicoCon)
    const campos = camposCambiados(antes, despues)
    if (!campos.length) continue
    cambios.push({
      plantilla: p,
      texto,
      antes: antes.comando,
      despues: despues.comando,
      campos,
      detalleAntes: antes,
      detalleDespues: despues
    })
  }

  return {
    regresiones,
    cambios,
    motivo: motivoDe({ entrada, lexicoBase, plantillas })
  }
}
