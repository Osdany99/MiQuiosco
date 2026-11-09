import { validarEntrada } from '../schemas/vozLexico.js'

export const LEXICO_VERSION_SCHEMA = 1

export const LEXICO_BASE = Object.freeze({
  ventaFuerte: [
    'vende', 'vendeme', 'vendemelo', 'vendes', 'vendan', 'vender', 'vendo',
    'vendio', 'vendieron', 'vendimos', 'vendiste', 'anota', 'anotame',
    'anotamelo', 'registra', 'registrame', 'saca', 'sacame', 'despacha',
    'despachame', 'vendele', 'cobra', 'cobrame', 'cobrale', 'apunta', 'apuntame'
  ],
  ventaDebil: ['dame', 'damelo', 'ponme', 'ponmelo', 'pon'],
  navegacionVerbo: ['abre', 'abrir', 'abreme', 'muestra', 'muestrame', 'ir', 've', 'vamos', 'llevame', 'entra', 'entrar', 'ensename'],
  navegacionComplemento: ['hoy', 'dia', 'ayer', 'actual'],
  consultaMarca: ['cuanto', 'cuanta', 'cuantos', 'cuantas', 'hay', 'queda', 'quedan', 'stock', 'existencia', 'existencias', 'tenemos', 'tengo', 'disponible', 'disponibles', 'inventario'],
  destinos: {
    cuadre: ['cuadre'], cuadres: ['cuadres'],
    productos: ['productos', 'producto', 'catalogo'],
    clientes: ['clientes', 'cliente'],
    deudas: ['deudas', 'deuda', 'fiados', 'fiado'],
    recargas: ['recargas', 'recarga'],
    graficas: ['graficas', 'grafica', 'estadisticas'],
    quiosco: ['quiosco', 'kiosco'], almacen: ['almacen', 'inventario'],
    usuarios: ['usuarios'], proveedores: ['proveedores']
  }
})

const CATEGORIA_A_CAMPO = {
  venta_fuerte: 'ventaFuerte',
  venta_debil: 'ventaDebil',
  navegacion_verbo: 'navegacionVerbo',
  navegacion_complemento: 'navegacionComplemento',
  consulta_marca: 'consultaMarca',
  navegacion_destino: 'destinos'
}

function clonar(base) {
  return {
    ventaFuerte: [...(base.ventaFuerte || [])],
    ventaDebil: [...(base.ventaDebil || [])],
    navegacionVerbo: [...(base.navegacionVerbo || [])],
    navegacionComplemento: [...(base.navegacionComplemento || [])],
    consultaMarca: [...(base.consultaMarca || [])],
    destinos: Object.fromEntries(Object.entries(base.destinos || {}).map(([k, v]) => [k, [...v]]))
  }
}

// Devuelve un léxico NUEVO (no muta base). Ignora entradas inválidas o inactivas.
export function crearLexico(base, entradas = []) {
  const lexico = clonar(base || LEXICO_BASE)
  const efectivo = (base ? baseToEntries(lexico) : [])

  for (const entrada of (Array.isArray(entradas) ? entradas : [])) {
    const item = { activo: true, ...entrada }
    if (item.activo === false) continue
    const v = validarEntrada(item, efectivo)
    if (!v.ok) continue

    const campo = CATEGORIA_A_CAMPO[item.categoria]
    if (item.categoria === 'navegacion_destino') {
      if (!lexico.destinos[item.clave]) return lexico // guard
      if (!lexico.destinos[item.clave].includes(item.valor)) {
        lexico.destinos[item.clave].push(item.valor)
        efectivo.push(item)
      }
    } else {
      if (!lexico[campo].includes(item.valor)) {
        lexico[campo].push(item.valor)
        efectivo.push(item)
      }
    }
  }

  return Object.freeze ? Object.freeze(lexico) : lexico
}

function baseToEntries(base) {
  const out = []
  for (const cat of ['venta_fuerte', 'venta_debil', 'navegacion_verbo', 'navegacion_complemento', 'consulta_marca']) {
    const campo = CATEGORIA_A_CAMPO[cat]
    for (const v of base[campo] || []) out.push({ categoria: cat, valor: v, activo: true })
  }
  for (const [clave, palabras] of Object.entries(base.destinos || {})) {
    for (const v of palabras || []) out.push({ categoria: 'navegacion_destino', valor: v, clave, activo: true })
  }
  return out
}
