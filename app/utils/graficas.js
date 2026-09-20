import { TABLES } from '../../shared/tables'

const productoConfig = TABLES.productos
const cuadreConfig = TABLES.cuadres
const cuadreItemConfig = TABLES.cuadre_items

/**
 * calcularGrafica(key, opts) — Cálculo de todas las gráficas del negocio.
 *
 * Lee los datos a través de useRepo (respeta el modo de conexión: online →
 * Postgres vía API, local → sqlite). Reemplaza las llamadas a /api/graficas/*.
 *
 * Regla de negocio: todas las gráficas de ventas/finanzas se calculan SOLO
 * con cuadres CERRADOS. El cuadre abierto es un borrador con autoguardado
 * (líneas en cero, montos parciales) y contaminaba los resultados.
 * Excepciones: 'estado-cuadres' y 'cuadres-reabiertos', que por definición
 * necesitan ver todos los cuadres (usan `todosCuadres` sin filtrar).
 *
 * El período de cada línea se toma de la FECHA DEL CUADRE padre
 * (`cuadre.fecha`, día de negocio), nunca del `creadoEn` de la línea
 * (momento técnico de autoguardado/inserción, disperso en el tiempo).
 *
 * @param {string} key — identificador de la gráfica
 * @param {Object} opts — { desde, hasta, agrupacion, productoId }
 * @returns {Promise<Array>}
 */
export async function calcularGrafica(key, opts) {
  const productoRepo = useRepo(productoConfig, { toast: false })
  const cuadreRepo = useRepo(cuadreConfig, { toast: false })
  const itemsRepo = useRepo(cuadreItemConfig, { toast: false })

  switch (key) {
    case 'productos-mas-vendidos': return _productosMasVendidos(opts, productoRepo, cuadreRepo, itemsRepo)
    case 'productos-mayor-ganancia': return _productosMayorGanancia(opts, productoRepo, cuadreRepo, itemsRepo)
    case 'productos-menor-rotacion': return _productosMenorRotacion(opts, productoRepo, cuadreRepo, itemsRepo)
    case 'ganancia-por-periodo': return _gananciaPorPeriodo(opts, productoRepo, cuadreRepo, itemsRepo)
    case 'ingresos-por-periodo': return _ingresosPorPeriodo(opts, productoRepo, cuadreRepo, itemsRepo)
    case 'regalos-descuentos-por-periodo': return _regalosDescuentosPeriodo(opts, productoRepo, cuadreRepo, itemsRepo)
    case 'faltantes-sobrantes-acumulados': return _faltantesSobrantes(opts, productoRepo, cuadreRepo, itemsRepo)
    case 'evolucion-producto': return _evolucionProducto(opts, productoRepo, cuadreRepo, itemsRepo)
    case 'precio-usado-vs-oficial': return _precioUsadoVsOficial(opts, productoRepo, cuadreRepo, itemsRepo)
    case 'proporcion-formas-pago': return _proporcionFormasPago(opts, productoRepo, cuadreRepo, itemsRepo)
    case 'estado-cuadres': return _estadoCuadres(productoRepo, cuadreRepo, itemsRepo)
    case 'cuadres-reabiertos': return _cuadresReabiertos(productoRepo, cuadreRepo, itemsRepo)
    case 'pagos-trabajadores': return _pagosTrabajadores(opts, productoRepo, cuadreRepo, itemsRepo)
    case 'comparativa-por-trabajador': return _comparativaTrabajador(opts, productoRepo, cuadreRepo, itemsRepo)
    default: return []
  }
}

function ts(v) {
  const n = typeof v === 'number' ? v : Date.parse(v)
  return Number.isNaN(n) ? 0 : n
}

async function cargarDatos(opts, productoRepo, cuadreRepo, itemsRepo) {
  const [todosCuadres, todosItems, todosProductos] = await Promise.all([
    cuadreRepo.readAll(),
    itemsRepo.readAll(),
    productoRepo.readAll()
  ]).then(results => results.map(r => (Array.isArray(r) ? r : (r?.data ?? []))))

  const prodMap = {}
  for (const p of todosProductos) prodMap[p.id] = p

  // Rango como YYYY-MM-DD (comparación lexicográfica, sin desfases de zona
  // horaria). `hasta` es inclusivo.
  const desdeStr = opts.desde || ''
  const hastaStr = opts.hasta || ''

  // Solo cuadres CERRADOS en rango: el abierto es un borrador con
  // autoguardado (líneas en cero, montos parciales) y no debe contaminar
  // ventas, ganancias ni formas de pago.
  const cerradosEnRango = todosCuadres.filter((c) => {
    if (c.estado !== 'cerrado') return false
    const f = c.fecha || ''
    if (!f) return false
    if (desdeStr && f < desdeStr) return false
    if (hastaStr && f > hastaStr) return false
    return true
  })

  // Defensa ante duplicados locales (mismo puesto+fecha): gana el más reciente.
  const porPuestoFecha = new Map()
  for (const c of cerradosEnRango) {
    const k = `${c.puestoId ?? ''}||${c.fecha}`
    const prev = porPuestoFecha.get(k)
    if (!prev || ts(c.actualizadoEn) >= ts(prev.actualizadoEn)) porPuestoFecha.set(k, c)
  }
  const cuadres = [...porPuestoFecha.values()]

  const cuadreIds = new Set(cuadres.map(c => c.id))
  // Día de negocio de cada línea: la fecha del cuadre padre.
  const fechaDeCuadre = {}
  for (const c of cuadres) fechaDeCuadre[c.id] = c.fecha
  const items = todosItems.filter(i => cuadreIds.has(i.cuadreId))

  return { cuadres, items, prodMap, todosCuadres, fechaDeCuadre }
}

function clavePeriodo(fechaISO, agrupacion) {
  if (agrupacion === 'semana') {
    const d = new Date(fechaISO + 'T12:00:00')
    return `${d.getFullYear()}-W${getWeek(d)}`
  }
  if (agrupacion === 'mes') {
    const d = new Date(fechaISO + 'T12:00:00')
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }
  return fechaISO
}

/**
 * Agrupa filas { periodo: 'YYYY-MM-DD', ... } por día/semana/mes, suma con
 * `sumar(items)` y devuelve una entrada por período con datos, ordenada
 * cronológicamente. Los períodos vacíos se omiten (no se inventan ceros).
 */
function sumarPorPeriodo(filas, agrupacion, sumar) {
  const grupos = {}
  for (const f of filas) {
    if (!f.periodo) continue
    const clave = clavePeriodo(f.periodo, agrupacion)
    if (!grupos[clave]) grupos[clave] = []
    grupos[clave].push(f)
  }
  return Object.entries(grupos)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([periodo, items]) => ({ periodo, ...sumar(items) }))
}

function getWeek(d) {
  const start = new Date(d.getFullYear(), 0, 1)
  return Math.ceil(((d - start) / 86400000 + start.getDay() + 1) / 7)
}

async function _productosMasVendidos(opts, productoRepo, cuadreRepo, itemsRepo) {
  const { items, prodMap } = await cargarDatos(opts, productoRepo, cuadreRepo, itemsRepo)
  const ventas = {}
  for (const i of items) {
    const cant = Number(i.cantidad) || 0
    if (cant <= 0) continue
    ventas[i.productoId] = (ventas[i.productoId] || 0) + cant
  }
  return Object.entries(ventas)
    .map(([id, totalVendido]) => ({
      nombre: prodMap[id]?.nombre || '—',
      totalVendido
    }))
    .sort((a, b) => b.totalVendido - a.totalVendido)
    .slice(0, 10)
}

async function _productosMayorGanancia(opts, productoRepo, cuadreRepo, itemsRepo) {
  const { items, prodMap } = await cargarDatos(opts, productoRepo, cuadreRepo, itemsRepo)
  const ganancias = {}
  for (const i of items) {
    const cant = Number(i.cantidad) || 0
    if (cant <= 0) continue
    const p = prodMap[i.productoId]
    const ganancia = (Number(i.precioVentaUsado) - Number(p?.precioCompraActual || 0)) * cant
    ganancias[i.productoId] = (ganancias[i.productoId] || 0) + ganancia
  }
  return Object.entries(ganancias)
    .map(([id, gananciaTotal]) => ({
      nombre: prodMap[id]?.nombre || '—',
      gananciaTotal: Math.round(gananciaTotal)
    }))
    .sort((a, b) => b.gananciaTotal - a.gananciaTotal)
    .slice(0, 10)
}

async function _productosMenorRotacion(opts, productoRepo, cuadreRepo, itemsRepo) {
  const { items, prodMap } = await cargarDatos(opts, productoRepo, cuadreRepo, itemsRepo)
  const ventas = {}
  for (const i of items) {
    const cant = Number(i.cantidad) || 0
    if (cant <= 0) continue
    ventas[i.productoId] = (ventas[i.productoId] || 0) + cant
  }
  // Los activos sin ventas también cuentan (rotación cero).
  for (const [id, p] of Object.entries(prodMap)) {
    if (p?.activo !== false && !(id in ventas)) ventas[id] = 0
  }
  return Object.entries(ventas)
    .filter(([id]) => prodMap[id]?.activo !== false)
    .map(([id, totalVendido]) => ({
      nombre: prodMap[id]?.nombre || '—',
      totalVendido
    }))
    .sort((a, b) => a.totalVendido - b.totalVendido)
    .slice(0, 10)
}

async function _gananciaPorPeriodo(opts, productoRepo, cuadreRepo, itemsRepo) {
  const { items, prodMap, fechaDeCuadre } = await cargarDatos(opts, productoRepo, cuadreRepo, itemsRepo)
  const filas = []
  for (const i of items) {
    const cant = Number(i.cantidad) || 0
    if (cant <= 0) continue
    const periodo = fechaDeCuadre[i.cuadreId] || ''
    if (!periodo) continue
    const p = prodMap[i.productoId]
    filas.push({
      periodo,
      ganancia: (Number(i.precioVentaUsado) - Number(p?.precioCompraActual || 0)) * cant
    })
  }
  return sumarPorPeriodo(filas, opts.agrupacion || 'dia', g => ({
    ganancia: Math.round(g.reduce((s, x) => s + x.ganancia, 0))
  }))
}

async function _ingresosPorPeriodo(opts, productoRepo, cuadreRepo, itemsRepo) {
  const { items, fechaDeCuadre } = await cargarDatos(opts, productoRepo, cuadreRepo, itemsRepo)
  const filas = []
  for (const i of items) {
    if ((Number(i.cantidad) || 0) <= 0) continue
    const periodo = fechaDeCuadre[i.cuadreId] || ''
    if (!periodo) continue
    filas.push({ periodo, ingresoTotal: Number(i.subtotal) || 0 })
  }
  return sumarPorPeriodo(filas, opts.agrupacion || 'dia', g => ({
    ingresoTotal: g.reduce((s, x) => s + x.ingresoTotal, 0)
  }))
}

async function _regalosDescuentosPeriodo(opts, productoRepo, cuadreRepo, itemsRepo) {
  const { items, fechaDeCuadre } = await cargarDatos(opts, productoRepo, cuadreRepo, itemsRepo)
  const filas = []
  for (const i of items) {
    if (!i.tipoLinea || i.tipoLinea === 'normal') continue
    if ((Number(i.cantidad) || 0) <= 0) continue
    const periodo = fechaDeCuadre[i.cuadreId] || ''
    if (!periodo) continue
    filas.push({
      periodo,
      esRegalo: i.tipoLinea === 'regalo',
      valor: Number(i.subtotal) || 0
    })
  }
  return sumarPorPeriodo(filas, opts.agrupacion || 'dia', g => ({
    valorRegalado: g.filter(x => x.esRegalo).reduce((s, x) => s + x.valor, 0),
    valorDescontado: g.filter(x => !x.esRegalo).reduce((s, x) => s + x.valor, 0)
  }))
}

async function _faltantesSobrantes(opts, productoRepo, cuadreRepo, itemsRepo) {
  const { cuadres } = await cargarDatos(opts, productoRepo, cuadreRepo, itemsRepo)
  const filas = cuadres
    .filter(c => c.diferencia != null)
    .map(c => ({
      periodo: c.fecha,
      diferencia: Number(c.diferencia) || 0
    }))
  return sumarPorPeriodo(filas, opts.agrupacion || 'dia', g => ({
    diferencia: g.reduce((s, x) => s + x.diferencia, 0)
  }))
}

async function _evolucionProducto(opts, productoRepo, cuadreRepo, itemsRepo) {
  if (!opts.productoId) return []
  const { items, fechaDeCuadre } = await cargarDatos(opts, productoRepo, cuadreRepo, itemsRepo)
  const diario = {}
  for (const i of items) {
    if (i.productoId !== opts.productoId) continue
    const cant = Number(i.cantidad) || 0
    if (cant <= 0) continue
    const fecha = fechaDeCuadre[i.cuadreId] || ''
    if (!fecha) continue
    diario[fecha] = (diario[fecha] || 0) + cant
  }
  return Object.entries(diario)
    .map(([fecha, cantidadVendida]) => ({ fecha, cantidadVendida }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
}

async function _precioUsadoVsOficial(opts, productoRepo, cuadreRepo, itemsRepo) {
  if (!opts.productoId) return []
  const { items, prodMap, fechaDeCuadre } = await cargarDatos(opts, productoRepo, cuadreRepo, itemsRepo)
  const prod = prodMap[opts.productoId]
  if (!prod) return []
  return items
    .filter(i => i.productoId === opts.productoId)
    .map(i => ({
      fecha: fechaDeCuadre[i.cuadreId] || '',
      precioVentaUsado: Number(i.precioVentaUsado) || 0,
      precioOficialActual: Number(prod.precioVentaActual) || 0
    }))
    .filter(r => r.fecha)
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
}

async function _proporcionFormasPago(opts, productoRepo, cuadreRepo, itemsRepo) {
  const { cuadres } = await cargarDatos(opts, productoRepo, cuadreRepo, itemsRepo)
  let efectivo = 0
  let transferencia = 0
  let fiado = 0
  for (const c of cuadres) {
    efectivo += Number(c.totalRealCaja) || 0
    transferencia += Number(c.montoTransferencia) || 0
    fiado += Number(c.montoFiado) || 0
  }
  return [
    { forma: 'Efectivo', total: efectivo },
    { forma: 'Transferencia', total: transferencia },
    { forma: 'Fiado', total: fiado }
  ]
}

async function _estadoCuadres(productoRepo, cuadreRepo, itemsRepo) {
  const { todosCuadres } = await cargarDatos({}, productoRepo, cuadreRepo, itemsRepo)
  const estados = { abierto: 0, cerrado: 0 }
  let reabiertos = 0
  for (const c of todosCuadres) {
    if (c.reabiertoVeces > 0) reabiertos++
    else if (c.estado === 'cerrado') estados.cerrado++
    else estados.abierto++
  }
  return [
    { estado: 'Abiertos', cantidad: estados.abierto },
    { estado: 'Cerrados', cantidad: estados.cerrado },
    { estado: 'Reabiertos', cantidad: reabiertos }
  ]
}

async function _cuadresReabiertos(productoRepo, cuadreRepo, itemsRepo) {
  const { todosCuadres } = await cargarDatos({}, productoRepo, cuadreRepo, itemsRepo)
  return todosCuadres
    .filter(c => c.reabiertoVeces > 0)
    .map(c => ({
      fecha: c.fecha,
      reabiertoVeces: c.reabiertoVeces,
      ultimaReapertura: c.ultimaReaperturaEn
        ? new Date(c.ultimaReaperturaEn).toLocaleString('es-ES')
        : '—'
    }))
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
}

async function _pagosTrabajadores(opts, productoRepo, cuadreRepo, itemsRepo) {
  const { cuadres } = await cargarDatos(opts, productoRepo, cuadreRepo, itemsRepo)
  const pagos = {}
  for (const c of cuadres) {
    const id = c.trabajadorTurnoId || 'sin-asignar'
    pagos[id] = (pagos[id] || 0) + (Number(c.pagoTrabajador) || 0)
  }
  return Object.entries(pagos).map(([trabajadorNombre, totalPagado]) => ({
    trabajadorNombre,
    totalPagado
  }))
}

async function _comparativaTrabajador(opts, productoRepo, cuadreRepo, itemsRepo) {
  const { cuadres } = await cargarDatos(opts, productoRepo, cuadreRepo, itemsRepo)
  const stats = {}
  for (const c of cuadres) {
    const id = c.trabajadorTurnoId || 'sin-asignar'
    if (!stats[id]) stats[id] = { totalCuadres: 0, sumDiferencia: 0, cuadresConFaltante: 0 }
    stats[id].totalCuadres++
    if (c.diferencia != null) {
      const diff = Number(c.diferencia)
      stats[id].sumDiferencia += diff
      if (diff < 0) stats[id].cuadresConFaltante++
    }
  }
  return Object.entries(stats).map(([trabajadorNombre, s]) => ({
    trabajadorNombre,
    totalCuadres: s.totalCuadres,
    diferenciaPromedio: s.totalCuadres > 0 ? Math.round(s.sumDiferencia / s.totalCuadres) : 0,
    cuadresConFaltante: s.cuadresConFaltante
  }))
}
