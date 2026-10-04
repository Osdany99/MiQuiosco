/**
 * shared/inventario/analitica.js — Cálculos analíticos sobre el libro de
 * inventario (lotes + movimientos).
 *
 * Lógica pura: sin Vue, sin DB, sin ECharts. La usan las gráficas de
 * app/utils/graficas.js y las vistas de /almacen y /quiosco.
 *
 * Dos reglas del libro que este módulo respeta siempre:
 *
 * 1. TODO se suma en NETO. Una reapertura no marca el movimiento original:
 *    inserta su contramovimiento (tipo 'anulacion') con los deltas invertidos
 *    (ver construirAnulacionCuadre). Contar filas 'venta' daría ventas que ya
 *    no existen, así que la unidad neta sale del delta, no del tipo.
 * 2. La fecha de negocio de una venta es la FECHA DE SU CUADRE, no su creadoEn
 *    (momento técnico del autoguardado o del reloj del dispositivo). Por eso
 *    los movimientos entran ya fechados con indiceFechasNegocio().
 *
 * Los tiempos se aceptan en epoch ms, ISO o Date: el repo remoto normaliza a
 * epoch, el sqlite guarda epoch y las filas de cuadre/lote traen 'YYYY-MM-DD'.
 */

const DIA_MS = 86400000

/** Tramos de antigüedad de lote para el capital dormido. */
export const TRAMOS_EDAD = [
  { clave: '0-7', etiqueta: '0 a 7 días', desde: 0, hasta: 7 },
  { clave: '8-15', etiqueta: '8 a 15 días', desde: 8, hasta: 15 },
  { clave: '16-30', etiqueta: '16 a 30 días', desde: 16, hasta: 30 },
  { clave: '31-60', etiqueta: '31 a 60 días', desde: 31, hasta: 60 },
  { clave: '60+', etiqueta: 'Más de 60 días', desde: 61, hasta: Infinity }
]

// ---------------------------------------------------------------- fechas ----

/**
 * Normaliza cualquier timestamp a 'YYYY-MM-DD' en hora local (el día que el
 * jefe vive). Acepta epoch ms, ISO, Date y el propio 'YYYY-MM-DD'.
 */
export function aDia(v) {
  if (v == null || v === '') return ''
  if (typeof v === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v)
    if (m) return `${m[1]}-${m[2]}-${m[3]}`
    const n = Date.parse(v)
    return Number.isNaN(n) ? '' : aDia(n)
  }
  if (v instanceof Date) return aDia(v.getTime())
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return ''
  const d = new Date(n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 'YYYY-MM-DD' → entero de día UTC (aritmética sin errores de horario de verano). */
export function numeroDia(dia) {
  const d = aDia(dia)
  if (!d) return NaN
  const [y, m, dd] = d.split('-').map(Number)
  return Math.floor(Date.UTC(y, m - 1, dd) / DIA_MS)
}

/** Entero de día UTC → 'YYYY-MM-DD'. Inversa de numeroDia(). */
export function diaDesdeNumero(n) {
  if (!Number.isFinite(n)) return ''
  const d = new Date(n * DIA_MS)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/** Días entre dos fechas (b - a). 0 si alguna no es válida. */
export function diasEntre(desde, hasta) {
  const a = numeroDia(desde)
  const b = numeroDia(hasta)
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return b - a
}

/** ¿La fecha cae dentro del rango? Ambos extremos son INCLUSIVOS. Rango vacío = todo. */
export function enRango(dia, desde, hasta) {
  const d = aDia(dia)
  if (!d) return false
  const dsn = aDia(desde)
  const hsn = aDia(hasta)
  if (dsn && d < dsn) return false
  if (hsn && d > hsn) return false
  return true
}

// ------------------------------------------------------- fechas de negocio ----

/**
 * Fecha de negocio de cada movimiento, indexada por movimiento.id.
 *
 * - venta de cuadre  → cuadre.fecha (el día de negocio, no el del reloj)
 * - entrada          → lote.fechaEntrada (la fecha que se deanotó la compra)
 * - traspaso         → traspaso.fecha
 * - venta/deuda directa, merma, devolución → día del creadoEn
 *
 * Si falta la cabecera (sincronización a medias, lote borrado) cae al creadoEn:
 * es peor mostrar la fecha técnica que dejar el movimiento fuera.
 */
export function indiceFechasNegocio({ movimientos = [], cuadres = [], lotes = [], traspasos = [] }) {
  const cuadrePorId = new Map(cuadres.map(c => [c.id, c]))
  const lotePorId = new Map(lotes.map(l => [l.id, l]))
  const traspasoPorId = new Map(traspasos.map(t => [t.id, t]))
  const out = new Map()

  for (const m of movimientos) {
    let dia = ''
    const cuadre = m.cuadreId ? cuadrePorId.get(m.cuadreId) : null
    if (cuadre) dia = aDia(cuadre.fecha)
    if (!dia && m.tipo === 'entrada' && m.loteId) dia = aDia(lotePorId.get(m.loteId)?.fechaEntrada)
    if (!dia && m.traspasoId) dia = aDia(traspasoPorId.get(m.traspasoId)?.fecha)
    if (!dia) dia = aDia(m.creadoEn)
    if (dia) out.set(m.id, dia)
  }
  return out
}

/** Fecha de un movimiento ya sea cual sea la fuente (con o sin índice). */
function diaDe(m, fechas) {
  return fechas?.get?.(m.id) || aDia(m.creadoEn)
}

/** ¿La fila es una salida de mercancía (venta o su anulación)? */
function esVenta(m) {
  return m.tipo === 'venta' || m.tipo === 'anulacion'
}

/**
 * Unidades netas de una fila de venta, leídas del delta y no del tipo: la
 * venta original y su contramovimiento se cancelan solas (0), y al reabrir y
 * volver a cerrar quedan venta + anulación + venta = una venta.
 */
function unidadesDe(m) {
  return -(Math.trunc(Number(m.deltaAlmacen) || 0) + Math.trunc(Number(m.deltaQuiosco) || 0))
}

// -------------------------------------------------------------- ventas ----

/**
 * Resumen de ventas del libro en UNA pasada.
 *
 * @param {Array} movimientos — filas de movimientos_inventario
 * @param {Map<string,string>} fechas — indiceFechasNegocio() (opcional)
 * @returns {Map<string, { unidades:number, costo:number, dias:Map<string,number> }>}
 *   Por producto: unidades vendidas netas, costo FIFO real (suma de importes
 *   con el signo de cada fila) y las unidades por día (heatmap, evolución).
 *
 * El costo sale del libro, no de precioCompraActual: por eso es el número
 * real de lo que costó la mercancía que se vendió.
 */
export function resumenVentas(movimientos, fechas = new Map()) {
  const out = new Map()

  for (const m of movimientos) {
    if (m.anulado || !esVenta(m)) continue
    const delta = unidadesDe(m)
    if (delta === 0) continue

    let s = out.get(m.productoId)
    if (!s) {
      s = { unidades: 0, costo: 0, dias: new Map() }
      out.set(m.productoId, s)
    }
    s.unidades += delta
    // El importe siempre viene positivo (la anulación copia el del original):
    // el signo lo pone el delta, no el importe.
    s.costo += (delta > 0 ? 1 : -1) * Math.abs(Number(m.importe) || 0)

    const dia = diaDe(m, fechas)
    if (dia) s.dias.set(dia, (s.dias.get(dia) ?? 0) + delta)
  }

  return out
}

/**
 * Unidades y valor por tipo de movimiento y por día, EN MAGNITUD ABSOLUTA.
 *
 * Se usa para las series que van en positivo aunque el libro las guarde en
 * negativo (merma) o mezclen signos (devolución = quiosco → almacén):
 * compras, mermas, devoluciones, traspasos y anulaciones. El signo lo decide la
 * gráfica, no el dato.
 *
 * @param {Map<string,string>} fechas
 * @param {string[]} tipos
 * @returns {Map<string, Map<string, { unidades:number, valor:number }>>}
 */
export function magnitudesPorTipo(movimientos, fechas = new Map(), tipos = []) {
  const out = new Map()
  for (const t of tipos) out.set(t, new Map())

  for (const m of movimientos) {
    if (m.anulado) continue
    const porDia = out.get(m.tipo)
    if (!porDia) continue

    const dia = diaDe(m, fechas)
    if (!dia) continue
    let fila = porDia.get(dia)
    if (!fila) {
      fila = { unidades: 0, valor: 0 }
      porDia.set(dia, fila)
    }
    fila.unidades += Math.abs(Math.trunc(Number(m.cantidad) || 0))
    fila.valor += Math.abs(Number(m.importe) || 0)
  }

  return out
}

/**
 * Movimientos netos de un tipo, agrupados por producto y día. Es la base de
 * las gráficas de merma, devolución y traspaso por producto.
 * @returns {Map<string, Map<string, { unidades:number, valor:number }>>}
 */
export function magnitudesPorProducto(movimientos, fechas = new Map(), tipos = []) {
  const out = new Map()
  const permitidos = new Set(tipos)

  for (const m of movimientos) {
    if (m.anulado || !permitidos.has(m.tipo)) continue
    const dia = diaDe(m, fechas)
    if (!dia) continue
    let porDia = out.get(m.productoId)
    if (!porDia) {
      porDia = new Map()
      out.set(m.productoId, porDia)
    }
    let fila = porDia.get(dia)
    if (!fila) {
      fila = { unidades: 0, valor: 0 }
      porDia.set(dia, fila)
    }
    fila.unidades += Math.abs(Math.trunc(Number(m.cantidad) || 0))
    fila.valor += Math.abs(Number(m.importe) || 0)
  }

  return out
}

// ------------------------------------------------------------ cobertura ----

/**
 * Ventana efectiva para calcular un promedio de venta.
 *
 * El rango del filtro arranca en hoy (ver app/pages/graficas.vue), y con un
 * solo día el promedio de venta diaria no dice nada. Cuando la ventana es más
 * corta que `minDias` se amplía hacia atrás y se marca `ampliada`, para que la
 * gráfica pueda avisar con su leyenda en vez de mentir en silencio.
 *
 * @returns {{ desde:string, hasta:string, dias:number, ampliada:boolean }}
 */
export function ventanaCobertura({ desde, hasta, hoy, minDias = 7 }) {
  const fin = aDia(hasta) || aDia(hoy)
  const ini = aDia(desde) || fin
  if (!fin) return { desde: '', hasta: '', dias: 0, ampliada: false }

  const dias = Math.max(1, diasEntre(ini, fin) + 1)
  if (dias >= minDias) return { desde: ini, hasta: fin, dias, ampliada: false }

  return {
    desde: diaDesdeNumero(numeroDia(fin) - (minDias - 1)),
    hasta: fin,
    dias: minDias,
    ampliada: true
  }
}

/**
 * Días de cobertura por producto: cuánto aguanta el stock actual al ritmo de
 * venta del período. Es la gráfica que decide qué comprar.
 *
 * El promedio se divide por los DÍAS CON VENTA, no por los días del rango: en
 * un mes con 26 días de venta y 30 de rango, dividir por 30 subestima el ritmo
 * real. Un producto sin ventas en la ventana sale con `cobertura: null`
 * (ilimitada: nunca se acaba), no con un 0 falso.
 *
 * @param {object} p
 * @param {Map} p.resumen — resumenVentas()
 * @param {Map} p.saldos — saldosPorProducto(): productoId → { almacen, quiosco }
 * @param {Map} p.nombrePorProducto — id → nombre (opcional)
 * @returns {{ ventana:object, filas:Array }}
 */
export function diasCobertura({ resumen = new Map(), saldos = new Map(), nombrePorProducto = new Map(), desde, hasta, hoy, minDias = 7 }) {
  const ventana = ventanaCobertura({ desde, hasta, hoy, minDias })
  const filas = []

  for (const [productoId, s] of resumen) {
    let unidades = 0
    let diasConVenta = 0
    for (const [dia, u] of s.dias) {
      if (!enRango(dia, ventana.desde, ventana.hasta)) continue
      unidades += u
      if (u > 0) diasConVenta++
    }
    if (unidades <= 0) continue

    const sal = saldos.get(productoId) ?? { almacen: 0, quiosco: 0 }
    const stock = (Number(sal.almacen) || 0) + (Number(sal.quiosco) || 0)
    const promedioDiario = unidades / Math.max(1, diasConVenta)
    const cobertura = promedioDiario > 0 ? Math.round((stock / promedioDiario) * 10) / 10 : null

    filas.push({
      productoId,
      nombre: nombrePorProducto.get(productoId) ?? '—',
      stock,
      almacen: Number(sal.almacen) || 0,
      quiosco: Number(sal.quiosco) || 0,
      unidades,
      diasConVenta,
      promedioDiario: Math.round(promedioDiario * 100) / 100,
      cobertura,
      estado: cobertura === null
        ? 'sin-ventas'
        : (cobertura < 3 ? 'error' : (cobertura < 7 ? 'warning' : 'success'))
    })
  }

  // Lo más crítico primero: lo que se acaba antes va arriba.
  filas.sort((a, b) => {
    if (a.cobertura === null) return 1
    if (b.cobertura === null) return -1
    return a.cobertura - b.cobertura
  })

  return { ventana, filas }
}

// ---------------------------------------------------- antigüedad de lote ----

function tramoDe(dias) {
  for (const t of TRAMOS_EDAD) {
    if (dias <= t.hasta) return t.clave
  }
  return TRAMOS_EDAD[TRAMOS_EDAD.length - 1].clave
}

/**
 * Antigüedad del stock: cuánto lleva parado lo que todavía no se ha vendido.
 *
 * Se apoya en el saldo POR LOTE que da saldosDesdeMovimientos(): un lote cuyo
 * saldo llegó a 0 deja de contar, y el resto se pondera por su propio precio
 * FIFO (que es lo que se recupera si se vende mañana).
 *
 * @param {object} p
 * @param {Array} p.lotes
 * @param {Map} p.saldos — saldosDesdeMovimientos(): productoId → { porLote }
 * @param {Map} p.nombrePorProducto — id → nombre (opcional)
 * @param {string|number} p.hoy
 * @returns {{ lotes:Array, porTramo:Array, totalValor:number, totalUnidades:number }}
 */
export function antiguedadLotes({ lotes = [], saldos = new Map(), nombrePorProducto = new Map(), hoy }) {
  const hoyN = numeroDia(hoy)
  const saldoPorLote = new Map()
  for (const s of saldos.values()) {
    if (!s?.porLote) continue
    for (const [loteId, l] of s.porLote) {
      const previo = saldoPorLote.get(loteId) ?? { almacen: 0, quiosco: 0 }
      previo.almacen += l.almacen || 0
      previo.quiosco += l.quiosco || 0
      saldoPorLote.set(loteId, previo)
    }
  }

  const filas = []
  for (const l of lotes) {
    if (l.anulado) continue
    const sal = saldoPorLote.get(l.id)
    const saldo = (sal?.almacen ?? 0) + (sal?.quiosco ?? 0)
    if (saldo <= 0) continue

    const dias = Math.max(0, hoyN - numeroDia(l.fechaEntrada))
    const precio = Number(l.precioUnitario) || 0
    filas.push({
      loteId: l.id,
      productoId: l.productoId,
      nombre: nombrePorProducto.get(l.productoId) ?? '—',
      fechaEntrada: aDia(l.fechaEntrada),
      dias,
      tramo: tramoDe(dias),
      saldo,
      almacen: sal?.almacen ?? 0,
      quiosco: sal?.quiosco ?? 0,
      precioUnitario: precio,
      valor: Math.round(saldo * precio * 100) / 100
    })
  }

  // Del lote más viejo al más reciente: el que más duele va arriba.
  filas.sort((a, b) => b.dias - a.dias || String(a.fechaEntrada).localeCompare(String(b.fechaEntrada)))

  const porTramo = TRAMOS_EDAD.map((t) => {
    const enTramo = filas.filter(f => f.tramo === t.clave)
    return {
      clave: t.clave,
      etiqueta: t.etiqueta,
      dias: t.desde,
      valor: Math.round(enTramo.reduce((s, f) => s + f.valor, 0) * 100) / 100,
      unidades: enTramo.reduce((s, f) => s + f.saldo, 0),
      lotes: enTramo.length
    }
  })

  return {
    lotes: filas,
    porTramo,
    totalValor: Math.round(filas.reduce((s, f) => s + f.valor, 0) * 100) / 100,
    totalUnidades: filas.reduce((s, f) => s + f.saldo, 0)
  }
}

/**
 * Antigüedad media ponderada por valor del stock: los días que lleva dormida
 * la plata, no las unidades.
 */
export function antiguedadMediaPonderada(filas) {
  const total = (filas ?? []).reduce((s, f) => s + f.valor, 0)
  if (total <= 0) return 0
  return Math.round(((filas ?? []).reduce((s, f) => s + f.dias * f.valor, 0) / total) * 10) / 10
}

// ------------------------------------------------------ valor y estado ----

/**
 * Totales de plata parada en el negocio. `filas` son las de vistaSaldos(),
 * que ya traen valorizadoAlmacen/valorizadoQuiosco a costo FIFO actual.
 */
export function totalesValorInventario(filas = []) {
  let almacen = 0
  let quiosco = 0
  let unidadesAlmacen = 0
  let unidadesQuiosco = 0
  for (const f of filas) {
    almacen += Number(f.valorizadoAlmacen) || 0
    quiosco += Number(f.valorizadoQuiosco) || 0
    unidadesAlmacen += Number(f.almacen) || 0
    unidadesQuiosco += Number(f.quiosco) || 0
  }
  const r2 = n => Math.round(n * 100) / 100
  return {
    almacen: r2(almacen),
    quiosco: r2(quiosco),
    total: r2(almacen + quiosco),
    unidadesAlmacen,
    unidadesQuiosco,
    productos: filas.length
  }
}

const UMBRAL_COBERTURA_CRITICO = 3
const UMBRAL_COBERTURA_REPONER = 7

/**
 * Estado de una fila de inventario. Fuente única: la usan la vista de /almacen
 * y /quiosco (useVistaInventario) y el pie de estado del stock.
 *
 * @param {object} fila — una fila de vistaSaldos()
 * @param {'almacen'|'quiosco'} ubicacion
 * @returns {{ estado:'ok'|'reponer'|'bajo-minimo'|'no-se-vende', texto:string }}
 */
export function estadoDeFila(fila, ubicacion = 'almacen') {
  const esQuiosco = ubicacion === 'quiosco'

  // Desactivado solo del quiosco conserva su stock: se muestra, pero marcado
  // para que el jefe lo devuelva o lo ajuste en vez de perderlo de vista.
  if (esQuiosco && fila.seVende === false) {
    return { estado: 'no-se-vende', texto: 'No se vende' }
  }

  const stock = esQuiosco ? Number(fila.quiosco) || 0 : Number(fila.almacen) || 0
  const minimo = esQuiosco ? Number(fila.stockMinimoQuiosco) || 0 : Number(fila.stockMinimoAlmacen) || 0
  if (stock < minimo) return { estado: 'bajo-minimo', texto: 'Bajo mínimo' }

  if (esQuiosco && stock < (Number(fila.stockRecomendadoQuiosco) || 0)) {
    return { estado: 'reponer', texto: 'Reponer' }
  }
  return { estado: 'ok', texto: 'OK' }
}

/** Fila para el pie: {'OK' | 'Reponer' | 'Bajo mínimo' | 'No se vende'} */
export function conteoEstadoStock(filas = [], ubicacion = 'almacen') {
  const conteo = { 'ok': 0, 'reponer': 0, 'bajo-minimo': 0, 'no-se-vende': 0 }
  for (const f of filas) conteo[estadoDeFila(f, ubicacion).estado]++
  return [
    { estado: 'OK', clave: 'ok', cantidad: conteo.ok },
    { estado: 'Reponer', clave: 'reponer', cantidad: conteo.reponer },
    { estado: 'Bajo mínimo', clave: 'bajo-minimo', cantidad: conteo['bajo-minimo'] },
    { estado: 'No se vende', clave: 'no-se-vende', cantidad: conteo['no-se-vende'] }
  ]
}

export { UMBRAL_COBERTURA_CRITICO, UMBRAL_COBERTURA_REPONER }
