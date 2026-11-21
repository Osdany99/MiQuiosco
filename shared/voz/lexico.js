import { validarEntrada } from '../schemas/vozLexico.js'

export const LEXICO_VERSION_SCHEMA = 1

/**
 * Vocabulario base de la voz. Lo que el super_admin añade o desactiva desde
 * `/admin/voz-lexico` se aplica encima de esta lista.
 *
 * Solo verbos y marcas de una palabra: números, artículos, palabras vacías y
 * frases de varias palabras viven en el parser y no se administran.
 */
export const LEXICO_BASE = Object.freeze({
  ventaFuerte: [
    'vende', 'vendeme', 'vendemelo', 'vendes', 'vendan', 'vender', 'vendo',
    'vendio', 'vendieron', 'vendimos', 'vendiste', 'anota', 'anotame',
    'anotamelo', 'registra', 'registrame', 'saca', 'sacame', 'despacha',
    'despachame', 'vendele', 'cobra', 'cobrame', 'cobrale', 'apunta', 'apuntame'
  ],
  ventaDebil: ['dame', 'damelo', 'ponme', 'ponmelo'],
  consultaMarca: [
    'cuanto', 'cuanta', 'cuantos', 'cuantas', 'hay', 'queda', 'quedan',
    'stock', 'existencia', 'existencias', 'tenemos', 'tengo', 'disponible',
    'disponibles', 'inventario'
  ],
  fiadoVerbo: ['fia', 'fiale', 'fiar', 'fias', 'fian', 'fiame', 'fiamelo', 'fiarle'],
  fiadoVentaVerbo: [
    'vende', 'vendeme', 'anota', 'anotame', 'apunta', 'apuntame', 'registra',
    'saca', 'despacha'
  ],
  cobroVerbo: [
    'cobra', 'cobrame', 'cobrale', 'cobrar', 'cobre', 'cobren',
    'abona', 'aboname', 'abonale', 'abonar', 'abono',
    'paga', 'pagame', 'pagale', 'pagar', 'pago', 'pague', 'pagaron'
  ],
  cobroMarca: ['pago', 'pague', 'pagaron', 'abono'],
  precioMarca: ['cuesta', 'cuestan', 'precio', 'precios', 'vale', 'valen', 'sale', 'salen'],
  deudaMarca: ['debe', 'deben', 'deuda', 'deudas'],
  entradaVerbo: [
    'entraron', 'entro', 'entra', 'entrada', 'ingresaron', 'ingreso', 'ingresa',
    'llegaron', 'llego', 'llega', 'compre', 'compramos', 'compra', 'recibi',
    'recibimos', 'meti', 'metimos', 'mete', 'echaron', 'echo'
  ],
  precioVerbo: [
    'cambia', 'cambiar', 'cambiale', 'cambiamelo', 'pon', 'ponle', 'ponme',
    'pongale', 'sube', 'subele', 'baja', 'bajale', 'actualiza', 'actualizale',
    'corrige', 'corrigele', 'deja', 'dejalo', 'fija', 'fijale'
  ],
  traspasoVerbo: [
    'pasa', 'pasame', 'pasale', 'pasar', 'mueve', 'mueveme', 'muevelo',
    'muevela', 'traspasa', 'traspasame', 'traslada', 'transfiere', 'transferir',
    'transfiereme', 'transferi', 'transferio', 'repone', 'repon', 'reponer',
    // Verbos confirmados por el dueño para llevar mercancía al quiosco. Solo
    // son traspaso si la frase nombra una ubicación («lleva 10 azúcar» sigue
    // siendo venta).
    'envia', 'envias', 'envie', 'envien', 'enviar',
    'manda', 'mandas', 'mandame', 'mandalo', 'mandala', 'mandar',
    'lleva', 'llevas', 'llevame', 'llevalo', 'llevala', 'llevar',
    'echa', 'echas', 'echame', 'echalo', 'echala', 'echar',
    'sube', 'subes', 'subeme', 'subelo', 'subela', 'subir'
  ],
  transferenciaVerbo: ['transfiere', 'transfiereme', 'transferir', 'transfiero', 'transferi'],
  mermaVerbo: [
    'rompieron', 'rompio', 'rompimos', 'rompi', 'vencieron', 'vencio',
    'vencimos', 'venci', 'dano', 'danaron', 'danamos', 'perdieron', 'perdio',
    'perdimos', 'perdi', 'cayeron', 'cayo', 'caimos', 'mojaron', 'mojo',
    'mojamos', 'derramaron', 'derramo', 'derramamos', 'cogieron', 'cogio',
    'cogimos', 'cogi', 'merma', 'tira', 'tirame', 'bota', 'botame',
    'descarta', 'descarte'
  ],
  devolucionVerbo: [
    'devuelve', 'devuelveme', 'devuelvamelo', 'devuelvele', 'regresa',
    'regresame', 'retorna', 'retorname'
  ],
  altaVerbo: [
    'agrega', 'agregame', 'anade', 'anademe', 'crea', 'creame', 'registra',
    'registrame', 'nuevo', 'nueva', 'alta'
  ],
  moverVerbo: ['pon', 'ponme', 'coloca', 'colocame', 'mueve', 'mueveme', 'ordena', 'ordename'],
  cuadreAbrir: ['abre', 'abrir', 'abreme'],
  cuadreCerrar: ['cierra', 'cerrar', 'cierralo', 'cierre']
})

export const CATEGORIA_A_CAMPO = {
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

function clonar(base) {
  const out = {}
  for (const campo of Object.values(CATEGORIA_A_CAMPO)) {
    out[campo] = [...(base?.[campo] || [])]
  }
  return out
}

function baseToEntries(base) {
  const out = []
  for (const [categoria, campo] of Object.entries(CATEGORIA_A_CAMPO)) {
    for (const valor of base?.[campo] || []) out.push({ categoria, valor, activo: true })
  }
  return out
}

/**
 * Devuelve un léxico NUEVO (no muta la base) con las altas y bajas aplicadas.
 *
 * Una entrada `activo:false` es un tombstone: quita esa palabra base de su
 * categoría. Las palabras retiradas se devuelven en `retiradas` para que el
 * intérprete no las resucite por el respaldo de «cantidad + producto».
 */
export function crearLexico(base, entradas = []) {
  const lexico = clonar(base || LEXICO_BASE)
  const retiradas = []
  const lista = Array.isArray(entradas) ? entradas : []

  for (const entrada of lista) {
    const item = { activo: true, ...entrada }
    const campo = CATEGORIA_A_CAMPO[item.categoria]
    // Categoría retirada del producto (navegación): se ignora sin romper.
    if (!campo) continue

    const v = validarEntrada(item, baseToEntries(lexico), baseToEntries(base || LEXICO_BASE))
    if (!v.ok) continue

    const actual = lexico[campo]
    if (item.activo === false) {
      if (actual.includes(item.valor)) {
        lexico[campo] = actual.filter(valor => valor !== item.valor)
        retiradas.push({ categoria: item.categoria, valor: item.valor })
      }
    } else if (!actual.includes(item.valor)) {
      lexico[campo].push(item.valor)
    }
  }

  lexico.retiradas = retiradas
  return Object.freeze ? Object.freeze(lexico) : lexico
}

/** Entradas del léxico base como lista, para validar altas desde el panel. */
export function entradasLexicoBase(base = LEXICO_BASE) {
  return baseToEntries(base)
}
