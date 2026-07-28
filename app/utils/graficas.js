import { TABLES } from '~~/shared/tables'

const productoConfig = TABLES.productos
const cuadreConfig = TABLES.cuadres
const cuadreItemConfig = TABLES.cuadre_items

/**
 * calcularGrafica(key, opts) — Cálculo local de todas las gráficas del negocio.
 *
 * Reemplaza las llamadas a /api/graficas/* leyendo desde useLocalRepo.
 *
 * @param {string} key — identificador de la gráfica
 * @param {Object} opts — { desde, hasta, agrupacion, productoId }
 * @returns {Promise<Array>}
 */
export async function calcularGrafica(key, opts) {
  const productoRepo = useLocalRepo(productoConfig)
  const cuadreRepo = useLocalRepo(cuadreConfig)
  const itemsRepo = useLocalRepo(cuadreItemConfig)

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

async function cargarDatos(opts, productoRepo, cuadreRepo, itemsRepo) {
  const [todosCuadres, todosItems, todosProductos] = await Promise.all([
    cuadreRepo.readAll(),
    itemsRepo.readAll(),
    productoRepo.readAll()
  ])

  const prodMap = {}
  for (const p of todosProductos) prodMap[p.id] = p

  const desdeMs = opts.desde ? new Date(opts.desde).getTime() : 0
  const hastaMs = opts.hasta ? new Date(opts.hasta).getTime() + 86400000 : Infinity

  const cuadresFiltrados = todosCuadres.filter((c) => {
    const cMs = new Date(c.fecha).getTime()
    return cMs >= desdeMs && cMs < hastaMs
  })
  const cuadreIds = new Set(cuadresFiltrados.map(c => c.id))
  const itemsFiltrados = todosItems.filter(i => cuadreIds.has(i.cuadreId))

  return { cuadres: cuadresFiltrados, items: itemsFiltrados, prodMap, todosCuadres }
}

function agrupar(arr, key, agrupacion) {
  if (agrupacion === 'dia') return arr
  const grupos = {}
  for (const item of arr) {
    const d = new Date(item[key])
    const clave = agrupacion === 'semana'
      ? `${d.getFullYear()}-W${getWeek(d)}`
      : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (!grupos[clave]) grupos[clave] = []
    grupos[clave].push(item)
  }
  return Object.entries(grupos).map(([periodo, items]) => ({ periodo, items }))
}

function getWeek(d) {
  const start = new Date(d.getFullYear(), 0, 1)
  return Math.ceil(((d - start) / 86400000 + start.getDay() + 1) / 7)
}

async function _productosMasVendidos(opts, productoRepo, cuadreRepo, itemsRepo) {
  const { items, prodMap } = await cargarDatos(opts, productoRepo, cuadreRepo, itemsRepo)
  const ventas = {}
  for (const i of items) {
    ventas[i.productoId] = (ventas[i.productoId] || 0) + (Number(i.cantidad) || 0)
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
    const p = prodMap[i.productoId]
    const ganancia = (Number(i.precioVentaUsado) - Number(p?.precioCompraActual || 0)) * (Number(i.cantidad) || 0)
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
    ventas[i.productoId] = (ventas[i.productoId] || 0) + (Number(i.cantidad) || 0)
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
  const { items, prodMap } = await cargarDatos(opts, productoRepo, cuadreRepo, itemsRepo)
  const periodos = agrupar(
    items.map((i) => {
      const p = prodMap[i.productoId]
      const ganancia = (Number(i.precioVentaUsado) - Number(p?.precioCompraActual || 0)) * (Number(i.cantidad) || 0)
      return { periodo: i.creadoEn ? new Date(i.creadoEn).toISOString().split('T')[0] : '', ganancia }
    }),
    'periodo',
    opts.agrupacion || 'dia'
  )
  return periodos.map(g => ({
    periodo: g.periodo ?? g,
    ganancia: Math.round(g.items ? g.items.reduce((s, x) => s + x.ganancia, 0) : g.ganancia)
  }))
}

async function _ingresosPorPeriodo(opts, productoRepo, cuadreRepo, itemsRepo) {
  const { items } = await cargarDatos(opts, productoRepo, cuadreRepo, itemsRepo)
  const periodos = agrupar(
    items.map(i => ({
      periodo: i.creadoEn ? new Date(i.creadoEn).toISOString().split('T')[0] : '',
      ingresoTotal: Number(i.subtotal) || 0
    })),
    'periodo',
    opts.agrupacion || 'dia'
  )
  return periodos.map(g => ({
    periodo: g.periodo ?? g,
    ingresoTotal: g.items ? g.items.reduce((s, x) => s + x.ingresoTotal, 0) : g.ingresoTotal
  }))
}

async function _regalosDescuentosPeriodo(opts, productoRepo, cuadreRepo, itemsRepo) {
  const { items } = await cargarDatos(opts, productoRepo, cuadreRepo, itemsRepo)
  const filtrados = items.filter(i => i.tipoLinea && i.tipoLinea !== 'normal')
  const periodos = agrupar(
    filtrados.map((i) => {
      const valor = Number(i.subtotal) || 0
      return {
        periodo: i.creadoEn ? new Date(i.creadoEn).toISOString().split('T')[0] : '',
        esRegalo: i.tipoLinea === 'regalo',
        valor
      }
    }),
    'periodo',
    opts.agrupacion || 'dia'
  )
  return periodos.map(g => ({
    periodo: g.periodo ?? g,
    valorRegalado: g.items
      ? g.items.filter(x => x.esRegalo).reduce((s, x) => s + x.valor, 0)
      : (g.esRegalo ? g.valor : 0),
    valorDescontado: g.items
      ? g.items.filter(x => !x.esRegalo).reduce((s, x) => s + x.valor, 0)
      : (!g.esRegalo ? g.valor : 0)
  }))
}

async function _faltantesSobrantes(opts, productoRepo, cuadreRepo, itemsRepo) {
  const { cuadres } = await cargarDatos(opts, productoRepo, cuadreRepo, itemsRepo)
  const periodos = agrupar(
    cuadres.filter(c => c.diferencia != null).map(c => ({
      periodo: c.fecha,
      diferencia: Number(c.diferencia) || 0
    })),
    'periodo',
    opts.agrupacion || 'dia'
  )
  return periodos.map(g => ({
    periodo: g.periodo ?? g,
    diferencia: g.items ? g.items.reduce((s, x) => s + x.diferencia, 0) : g.diferencia
  }))
}

async function _evolucionProducto(opts, productoRepo, cuadreRepo, itemsRepo) {
  if (!opts.productoId) return []
  const { items } = await cargarDatos(opts, productoRepo, cuadreRepo, itemsRepo)
  const diario = {}
  for (const i of items) {
    if (i.productoId !== opts.productoId) continue
    const fecha = i.creadoEn ? new Date(i.creadoEn).toISOString().split('T')[0] : ''
    diario[fecha] = (diario[fecha] || 0) + (Number(i.cantidad) || 0)
  }
  return Object.entries(diario)
    .map(([fecha, cantidadVendida]) => ({ fecha, cantidadVendida }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
}

async function _precioUsadoVsOficial(opts, productoRepo, cuadreRepo, itemsRepo) {
  if (!opts.productoId) return []
  const { items, prodMap } = await cargarDatos(opts, productoRepo, cuadreRepo, itemsRepo)
  const prod = prodMap[opts.productoId]
  if (!prod) return []
  return items
    .filter(i => i.productoId === opts.productoId)
    .map(i => ({
      fecha: i.creadoEn ? new Date(i.creadoEn).toISOString().split('T')[0] : '',
      precioVentaUsado: Number(i.precioVentaUsado) || 0,
      precioOficialActual: Number(prod.precioVentaActual) || 0
    }))
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
