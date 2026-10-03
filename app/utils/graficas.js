import { TABLES } from '../../shared/tables'
import {
  aDia, enRango, indiceFechasNegocio, resumenVentas, magnitudesPorTipo,
  diasCobertura, antiguedadLotes, antiguedadMediaPonderada,
  totalesValorInventario, conteoEstadoStock, ventanaCobertura
} from '../../shared/inventario/analitica'
import { saldosPorProducto } from '../../shared/inventario/operaciones'
import { saldosDesdeMovimientos } from '../../shared/inventario/fifo'
import { vistaSaldos } from '../../shared/inventario/vista'

const productoConfig = TABLES.productos
const cuadreConfig = TABLES.cuadres
const cuadreItemConfig = TABLES.cuadre_items
const ventasDirectasConfig = TABLES.ventas_directas
const ventasDirectasItemsConfig = TABLES.ventas_directas_items
const cuentaFiadoConfig = TABLES.cuentas_fiado
const pagoFiadoConfig = TABLES.pagos_fiado
const usuarioConfig = TABLES.usuarios
const proveedorConfig = TABLES.proveedores
const loteConfig = TABLES.lotes
const traspasoConfig = TABLES.traspasos
const movimientoConfig = TABLES.movimientos_inventario

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
 * Las gráficas de inventario leen el LIBRO (movimientos_inventario + lotes).
 * Sus reglas, que están en shared/inventario/analitica.js y se respetan
 * siempre: se suma en NETO (una reapertura inserta su contramovimiento, no
 * borra la venta) y el costo es el del lote FIFO, no el precio de compra de
 * hoy. El libro se carga una vez y se cachea (ver limpiarCacheGraficas).
 *
 * @param {string} key — identificador de la gráfica
 * @param {Object} opts — { desde, hasta, agrupacion, productoId }
 * @returns {Promise<Array>}
 */
export async function calcularGrafica(key, opts) {
  const productoRepo = useRepo(productoConfig, { toast: false })
  const cuadreRepo = useRepo(cuadreConfig, { toast: false })
  const itemsRepo = useRepo(cuadreItemConfig, { toast: false })
  const ventasDirectasRepo = useRepo(ventasDirectasConfig, { toast: false })
  const cuentasFiadoRepo = useRepo(cuentaFiadoConfig, { toast: false })
  const pagosRepo = useRepo(pagoFiadoConfig, { toast: false })
  const usuariosRepo = useRepo(usuarioConfig, { toast: false })

  switch (key) {
    case 'productos-mas-vendidos': return _productosMasVendidos(opts, productoRepo, cuadreRepo, itemsRepo)
    case 'productos-mayor-ganancia': return _productosMayorGanancia(opts, productoRepo, cuadreRepo, itemsRepo)
    case 'productos-menor-rotacion': return _productosMenorRotacion(opts, productoRepo, cuadreRepo, itemsRepo)
    case 'ganancia-por-periodo': return _gananciaPorPeriodo(opts, productoRepo, cuadreRepo, itemsRepo)
    case 'ingresos-por-periodo': return _ingresosPorPeriodo(opts, productoRepo, cuadreRepo, itemsRepo)
    case 'ingresos-fuera-de-cuadre': return _ingresosFueraDeCuadre(opts, ventasDirectasRepo, cuentasFiadoRepo)
    case 'regalos-descuentos-por-periodo': return _regalosDescuentosPeriodo(opts, productoRepo, cuadreRepo, itemsRepo)
    case 'faltantes-sobrantes-acumulados': return _faltantesSobrantes(opts, productoRepo, cuadreRepo, itemsRepo)
    case 'evolucion-producto': return _evolucionProducto(opts, productoRepo, cuadreRepo, itemsRepo)
    case 'precio-usado-vs-oficial': return _precioUsadoVsOficial(opts, productoRepo, cuadreRepo, itemsRepo)
    case 'proporcion-formas-pago': return _proporcionFormasPago(opts, productoRepo, cuadreRepo, itemsRepo)
    case 'estado-cuadres': return _estadoCuadres(productoRepo, cuadreRepo, itemsRepo)
    case 'cuadres-reabiertos': return _cuadresReabiertos(productoRepo, cuadreRepo, itemsRepo)
    case 'pagos-trabajadores': return _pagosTrabajadores(opts, productoRepo, cuadreRepo, itemsRepo)
    case 'comparativa-por-trabajador': return _comparativaTrabajador(opts, productoRepo, cuadreRepo, itemsRepo)

    // ---------- Inventario ----------
    case 'dias-cobertura': return _diasCobertura(opts, reposInventario())
    case 'valor-inventario-producto': return _valorInventarioProducto(opts, reposInventario())
    case 'stock-almacen-vs-quiosco': return _stockAlmacenVsQuiosco(opts, reposInventario())
    case 'estado-stock': return _estadoStock(opts, reposInventario())
    case 'capital-dormido': return _capitalDormido(opts, reposInventario())
    case 'mermas-por-producto': return _mermasPorProducto(opts, reposInventario())
    case 'compras-vs-mermas': return _comprasVsMermas(opts, reposInventario())
    case 'traspasos-por-periodo': return _traspasosPorPeriodo(opts, reposInventario())
    case 'dias-sin-reponer': return _diasSinReponer(opts, reposInventario())
    case 'cobertura-traspasos': return _coberturaTraspasos(opts, reposInventario())
    case 'inversion-acumulada': return _inversionAcumulada(opts, reposInventario())
    case 'anulaciones-periodo': return _anulacionesPeriodo(opts, reposInventario())
    case 'fifo-antiguedad-vendida': return _fifoAntiguedadVendida(opts, reposInventario())
    case 'evolucion-precio-compra': return _evolucionPrecioCompra(opts, reposInventario())
    case 'gasto-por-proveedor': return _gastoPorProveedor(opts, reposInventario())
    case 'precio-medio-proveedor': return _precioMedioProveedor(opts, reposInventario())
    case 'heatmap-producto-dia': return _heatmapProductoDia(opts, reposInventario())

    // ---------- Ganancia real (FIFO) ----------
    case 'ganancia-real-fifo': return _gananciaRealFifo(opts, reposInventario(), false)
    case 'margen-porcentaje-producto': return _gananciaRealFifo(opts, reposInventario(), true)
    case 'diferencia-estimada-real': return _diferenciaEstimadaReal(opts, reposInventario())

    // ---------- Deudas ----------
    case 'deuda-por-cliente': return _deudaPorCliente(opts, cuentasFiadoRepo, usuariosRepo)
    case 'antiguedad-cartera': return _antiguedadCartera(opts, cuentasFiadoRepo)
    case 'cobrado-vs-fiado': return _cobradoVsFiado(opts, pagosRepo, cuentasFiadoRepo)

    default: return []
  }
}

/**
 * Repos de inventario + deudas en un solo objeto. Se crean aquí (y no al
 * principio de calcularGrafica) para que una gráfica de ventas no abra ocho
 * repos que no va a usar.
 */
function reposInventario() {
  return {
    cuadres: useRepo(cuadreConfig, { toast: false }),
    items: useRepo(cuadreItemConfig, { toast: false }),
    productos: useRepo(productoConfig, { toast: false }),
    usuarios: useRepo(usuarioConfig, { toast: false }),
    proveedores: useRepo(proveedorConfig, { toast: false }),
    lotes: useRepo(loteConfig, { toast: false }),
    traspasos: useRepo(traspasoConfig, { toast: false }),
    movimientos: useRepo(movimientoConfig, { toast: false }),
    ventasDirectas: useRepo(ventasDirectasConfig, { toast: false }),
    ventasDirectasItems: useRepo(ventasDirectasItemsConfig, { toast: false })
  }
}

/**
 * Cache del libro en memoria de módulo.
 *
 * El libro es append-only y el CRUD no admite rangos (solo igualdad por
 * columna), así que no hay forma de traer "solo este mes": o se trae el libro
 * entero o nada. Traerlo entero en cada gráfica y en cada clic de Actualizar
 * sería absurdo, así que se lee una vez por puesto+modo y se reutiliza.
 *
 * Se invalida a mano (botón Actualizar, o tras sincronizar) con
 * limpiarCacheGraficas().
 */
let cacheLibro = null

export function limpiarCacheGraficas() {
  cacheLibro = null
}

/**
 * Números de cabecera para el negocio, sin abrir ninguna gráfica: cuánta plata
 * está parada, cuánto de eso es del almacén, qué está por debajo del mínimo,
 * qué se perdió en mermas y cuánto se debe cobrar.
 *
 * Salen del libro ya cargado, así que no cuestan una segunda lectura.
 */
export async function resumenNegocio() {
  const lib = await cargarLibro(reposInventario())
  const totales = totalesValorInventario(lib.vista)

  // El mínimo depende de la ubicación que se mira: el quiosco es el que se
  // agota mientras vendemos.
  const quiosco = conteoEstadoStock(lib.vista, 'quiosco')
  const bajoMinimo = (quiosco.find(c => c.clave === 'bajo-minimo')?.cantidad ?? 0)
    + (quiosco.find(c => c.clave === 'reponer')?.cantidad ?? 0)

  // Merma del mes en curso.
  const desdeMes = `${hoy().slice(0, 7)}-01`
  let mermaMes = 0
  for (const m of lib.movimientos) {
    if (m.anulado || m.tipo !== 'merma') continue
    const dia = lib.fechas.get(m.id)
    if (!dia || !enRango(dia, desdeMes, '')) continue
    mermaMes += Math.abs(Number(m.importe) || 0)
  }

  // Cartera por cobrar, en todo el libro (una deuda no "está en rango": o se
  // debe o no se debe).
  const cuentas = fila(await useRepo(cuentaFiadoConfig, { toast: false }).readAll())
  const cartera = cuentas.reduce((s, c) => s + Math.max(0, saldoDe(c)), 0)

  const r2 = n => Math.round(n * 100) / 100
  return {
    valorInventario: totales.total,
    valorAlmacen: totales.almacen,
    valorQuiosco: totales.quiosco,
    productos: totales.productos,
    bajoMinimo,
    mermaMes: r2(mermaMes),
    cartera: Math.round(cartera)
  }
}

function fila(x) {
  return Array.isArray(x) ? x : (x?.data ?? [])
}

function ts(v) {
  const n = typeof v === 'number' ? v : Date.parse(v)
  return Number.isNaN(n) ? 0 : n
}

async function cargarDatos(opts, productoRepo, cuadreRepo, itemsRepo, usuariosRepo) {
  const [todosCuadres, todosItems, todosProductos, todosUsuarios] = await Promise.all([
    cuadreRepo.readAll(),
    itemsRepo.readAll(),
    productoRepo.readAll(),
    (usuariosRepo ?? useRepo(usuarioConfig, { toast: false })).readAll()
  ]).then(results => results.map(fila))

  const prodMap = {}
  for (const p of todosProductos) prodMap[p.id] = p

  // Nombre real del trabajador: estas dos gráficas lo mostraban por UUID, que
  // no le dice nada a nadie.
  const nombrePorUsuario = new Map()
  for (const u of todosUsuarios) nombrePorUsuario.set(u.id, u.nombre)

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

  return { cuadres, items, prodMap, todosCuadres, fechaDeCuadre, nombrePorUsuario }
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
  const { items, prodMap, cuadres, fechaDeCuadre } = await cargarDatos(opts, productoRepo, cuadreRepo, itemsRepo)
  const filas = []
  const porCuadre = new Map()
  for (const c of cuadres) porCuadre.set(c.id, c)
  const itemsPorCuadre = new Map()
  for (const i of items) {
    const cant = Number(i.cantidad) || 0
    if (cant <= 0) continue
    if (!itemsPorCuadre.has(i.cuadreId)) itemsPorCuadre.set(i.cuadreId, [])
    itemsPorCuadre.get(i.cuadreId).push(i)
  }
  for (const [cuadreId, lineas] of itemsPorCuadre) {
    const periodo = fechaDeCuadre[cuadreId] || ''
    if (!periodo) continue
    const c = porCuadre.get(cuadreId)
    // Ganancia FIFO congelada al cerrar: exacta. Cuadres viejos (null) usan
    // la estimación histórica con el precio de compra actual.
    if (c?.ganancia != null) {
      filas.push({ periodo, ganancia: Number(c.ganancia) || 0 })
      continue
    }
    for (const i of lineas) {
      const cant = Number(i.cantidad) || 0
      const p = prodMap[i.productoId]
      filas.push({
        periodo,
        ganancia: (Number(i.precioVentaUsado) - Number(p?.precioCompraActual || 0)) * cant
      })
    }
  }
  // Ganancia neta: restar lo pagado al trabajador en cada cuadre cerrado.
  // Cuadres sin trabajador (pago null/0) no aportan nada.
  for (const c of cuadres) {
    const pago = Number(c.pagoTrabajador) || 0
    if (pago <= 0) continue
    const periodo = c.fecha || ''
    if (!periodo) continue
    filas.push({ periodo, ganancia: -pago })
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

/**
 * Ingresos y ganancia fuera del cuadre: ventas directas en efectivo + deudas
 * directas. No viven en ningún cuadre (por eso no aparecen en
 * `ingresos-por-periodo` ni en `ganancia-por-periodo`), pero son dinero real
 * del negocio y por eso deserve su propia serie.
 *
 * La ganancia viene congelada en cada registro (FIFO al momento de la venta),
 * así que un cambio de precio posterior no altera lo ya mostrado.
 */
async function _ingresosFueraDeCuadre(opts, ventasDirectasRepo, cuentasFiadoRepo) {
  const [ventas, deudas] = await Promise.all([
    ventasDirectasRepo.readAll(),
    cuentasFiadoRepo.readAll()
  ]).then(rs => rs.map(fila))

  const desdeStr = opts.desde || ''
  const hastaStr = opts.hasta || ''

  // aDia y NO String(creadoEn).slice(0,10): los repos normalizan a epoch ms,
  // y el slice de un epoch daba '1735689600' como "fecha".
  const filas = []
  for (const v of ventas) {
    const dia = aDia(v.creadoEn)
    if (v.anulado || !dia || !enRango(dia, desdeStr, hastaStr)) continue
    filas.push({
      periodo: dia,
      ingresoDirecto: Number(v.montoTotal) || 0,
      gananciaDirecta: Number(v.ganancia) || 0
    })
  }
  // Deudas directas: el ingreso se reconoce al crearse (la mercancía salió).
  for (const c of deudas) {
    const dia = aDia(c.creadoEn)
    if (c.cuadreOrigenId || !dia || !enRango(dia, desdeStr, hastaStr)) continue
    filas.push({
      periodo: dia,
      ingresoDirecto: Number(c.montoTotal) || 0,
      gananciaDirecta: Number(c.ganancia) || 0
    })
  }

  return sumarPorPeriodo(filas, opts.agrupacion || 'dia', g => ({
    ingresoDirecto: Math.round(g.reduce((s, x) => s + x.ingresoDirecto, 0)),
    gananciaDirecta: Math.round(g.reduce((s, x) => s + x.gananciaDirecta, 0))
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
  const { cuadres, nombrePorUsuario } = await cargarDatos(opts, productoRepo, cuadreRepo, itemsRepo)
  const pagos = new Map()
  for (const c of cuadres) {
    const id = c.trabajadorTurnoId || 'sin-asignar'
    pagos.set(id, (pagos.get(id) || 0) + (Number(c.pagoTrabajador) || 0))
  }
  return [...pagos.entries()].map(([id, totalPagado]) => ({
    trabajadorNombre: nombrePorUsuario.get(id) ?? (id === 'sin-asignar' ? 'Sin asignar' : 'Desconocido'),
    totalPagado
  }))
}

async function _comparativaTrabajador(opts, productoRepo, cuadreRepo, itemsRepo) {
  const { cuadres, nombrePorUsuario } = await cargarDatos(opts, productoRepo, cuadreRepo, itemsRepo)
  const stats = new Map()
  for (const c of cuadres) {
    const id = c.trabajadorTurnoId || 'sin-asignar'
    if (!stats.has(id)) stats.set(id, { totalCuadres: 0, sumDiferencia: 0, cuadresConFaltante: 0 })
    const s = stats.get(id)
    s.totalCuadres++
    if (c.diferencia != null) {
      const diff = Number(c.diferencia)
      s.sumDiferencia += diff
      if (diff < 0) s.cuadresConFaltante++
    }
  }
  return [...stats.entries()].map(([id, s]) => ({
    trabajadorNombre: nombrePorUsuario.get(id) ?? (id === 'sin-asignar' ? 'Sin asignar' : 'Desconocido'),
    totalCuadres: s.totalCuadres,
    diferenciaPromedio: s.totalCuadres > 0 ? Math.round(s.sumDiferencia / s.totalCuadres) : 0,
    cuadresConFaltante: s.cuadresConFaltante
  }))
}

// ═══════════════════════════════ Inventario ════════════════════════════════

/**
 * Carga el libro completo una vez y devuelve todo lo derivado que las gráficas
 * de inventario necesitan: saldos por producto y por lote, fechas de negocio,
 * nombres y la vista valorizada (la misma de /almacen y /quiosco).
 *
 * Cacheada por puesto y modo de conexión: ver la nota de cacheLibro.
 */
async function cargarLibro(repos) {
  const auth = useAuth()
  const conexion = useModoConexion()
  const puestoId = auth.usuarioActual.value?.puestoId ?? ''
  const modo = conexion.modo.value
  if (cacheLibro && cacheLibro.puestoId === puestoId && cacheLibro.modo === modo) {
    return cacheLibro.datos
  }

  const [cuadres, items, productos, usuarios, proveedores, lotes, traspasos, movimientos, ventas, ventasItems]
    = await Promise.all([
      repos.cuadres.readAll(),
      repos.items.readAll(),
      repos.productos.readAll(),
      repos.usuarios.readAll(),
      repos.proveedores.readAll(),
      repos.lotes.readAll(),
      repos.traspasos.readAll(),
      repos.movimientos.readAll(),
      repos.ventasDirectas.readAll(),
      repos.ventasDirectasItems.readAll()
    ]).then(rs => rs.map(fila))

  // El endpoint de saldos ya filtra por puesto; los repos también, pero el
  // libro se puede filtrar por puestoId cuando el modo no lo hace.
  const delPuesto = rows => (puestoId ? rows.filter(r => !r.puestoId || r.puestoId === puestoId) : rows)

  const movs = delPuesto(movimientos)
  const lotesFilas = delPuesto(lotes)
  const cuadresFilas = delPuesto(cuadres)

  const fechas = indiceFechasNegocio({
    movimientos: movs,
    cuadres: cuadresFilas,
    lotes: lotesFilas,
    traspasos: delPuesto(traspasos)
  })

  const saldos = saldosPorProducto(movs)
  const saldosDetalle = saldosDesdeMovimientos(movs)
  const nombrePorProducto = new Map(productos.map(p => [p.id, p.nombre]))
  const nombrePorUsuario = new Map(usuarios.map(u => [u.id, u.nombre]))
  const nombrePorProveedor = new Map(proveedores.map(p => [p.id, p.nombre]))
  const lotePorId = new Map(lotesFilas.map(l => [l.id, l]))
  const cuadrePorId = new Map(cuadresFilas.map(c => [c.id, c]))

  const datos = {
    puestoId,
    modo,
    cuadres: cuadresFilas,
    items: delPuesto(items),
    productos,
    usuarios,
    proveedores,
    lotes: lotesFilas,
    traspasos: delPuesto(traspasos),
    movimientos: movs,
    ventasDirectas: delPuesto(ventas),
    ventasDirectasItems: delPuesto(ventasItems),
    fechas,
    saldos,
    saldosDetalle,
    nombrePorProducto,
    nombrePorUsuario,
    nombrePorProveedor,
    lotePorId,
    cuadrePorId,
    vista: vistaSaldos({ productos, lotes: lotesFilas, movimientos: movs }),
    resumenVentas: resumenVentas(movs, fechas)
  }

  cacheLibro = { puestoId, modo, datos }
  return datos
}

/** Hoy en 'YYYY-MM-DD', para las fotos de inventario (no dependen del rango). */
function hoy() {
  return aDia(Date.now())
}

/**
 * Ventana efectiva del cálculo de cobertura. La página la consulta para poner
 * la leyenda "se amplió a N días" cuando el rango del filtro es más corto de
 * lo que hace falta para promediar: el número grande necesita una base, y
 * promediar un solo día no dice nada.
 */
export function ventanaDeCobertura(opts) {
  return ventanaCobertura({ desde: opts?.desde, hasta: opts?.hasta, hoy: hoy(), minDias: opts?.minDias || 7 })
}

/** Días entre dos 'YYYY-MM-DD'. El segundo día es el de referencia. */
function diasHasta(hasta, desde) {
  const a = Date.parse(`${hasta}T00:00:00`)
  const b = Date.parse(`${desde}T00:00:00`)
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return Math.round((a - b) / 86400000)
}

/**
 * Días de cobertura: cuánto aguanta el stock actual al ritmo de venta.
 * Responde "¿qué compro hoy?", que es la pregunta del día.
 */
async function _diasCobertura(opts, repos) {
  const lib = await cargarLibro(repos)
  if (lib.resumenVentas.size === 0) return []

  // La ventana del filtro arranca en hoy y para promediar hacen falta días:
  // la amplía ventanaDeCobertura() y la página lo avisa con su leyenda.
  const { filas } = diasCobertura({
    resumen: lib.resumenVentas,
    saldos: lib.saldos,
    nombrePorProducto: lib.nombrePorProducto,
    desde: opts.desde,
    hasta: opts.hasta,
    hoy: hoy(),
    minDias: opts.minDias || 7
  })

  return filas.slice(0, 15).map(f => ({
    nombre: f.nombre,
    cobertura: f.cobertura,
    // Color por barra: rojo lo que se acaba en menos de 3 días.
    color: f.estado === 'error' ? '#ef4444' : (f.estado === 'warning' ? '#f59e0b' : undefined),
    stock: f.stock,
    promedioDiario: f.promedioDiario
  }))
}

/** Dónde está la plata: valor del stock por producto y por ubicación. */
async function _valorInventarioProducto(opts, repos) {
  const lib = await cargarLibro(repos)
  return [...lib.vista]
    .filter(f => (f.valorizadoAlmacen || 0) > 0 || (f.valorizadoQuiosco || 0) > 0)
    .sort((a, b) =>
      ((b.valorizadoAlmacen || 0) + (b.valorizadoQuiosco || 0))
      - ((a.valorizadoAlmacen || 0) + (a.valorizadoQuiosco || 0)))
    .slice(0, 12)
    .map(f => ({
      nombre: f.nombre,
      valorAlmacen: f.valorizadoAlmacen,
      valorQuiosco: f.valorizadoQuiosco
    }))
}

/** Unidades por ubicación: qué está atrás y qué falta adelante. */
async function _stockAlmacenVsQuiosco(opts, repos) {
  const lib = await cargarLibro(repos)
  return [...lib.vista]
    .filter(f => (f.almacen || 0) > 0 || (f.quiosco || 0) > 0)
    .sort((a, b) => ((b.almacen || 0) + (b.quiosco || 0)) - ((a.almacen || 0) + (a.quiosco || 0)))
    .slice(0, 12)
    .map(f => ({ nombre: f.nombre, almacen: f.almacen, quiosco: f.quiosco }))
}

/** Foto de salud del stock. Se muestra el quiosco: es donde se nota la falta. */
async function _estadoStock(opts, repos) {
  const lib = await cargarLibro(repos)
  const ubicacion = opts.ubicacion === 'almacen' ? 'almacen' : 'quiosco'
  return conteoEstadoStock(lib.vista, ubicacion).filter(c => c.cantidad > 0)
}

/**
 * Capital dormido: plata invertida en lotes que llevan tiempo sin venderse.
 * `antiguedadMediaPonderada` pondera por valor, no por unidades: interesa
 * cuánto tiempo lleva parada la plata.
 */
async function _capitalDormido(opts, repos) {
  const lib = await cargarLibro(repos)
  const r = antiguedadLotes({
    lotes: lib.lotes,
    saldos: lib.saldosDetalle,
    nombrePorProducto: lib.nombrePorProducto,
    hoy: hoy()
  })
  const media = antiguedadMediaPonderada(r.lotes)

  // El título del gráfico (el promedio) viaja en la fila: los componentes de
  // gráfica no tienen hueco para un subtítulo propio.
  return r.porTramo.map(t => ({
    tramo: t.clave,
    etiqueta: media > 0 ? `${t.etiqueta} · media ${media} d` : t.etiqueta,
    valor: t.valor
  }))
}

/** Qué se pierde: mermas por producto, con su motivo en el rótulo. */
async function _mermasPorProducto(opts, repos) {
  const lib = await cargarLibro(repos)
  const desde = opts.desde || ''
  const hasta = opts.hasta || ''

  const porProducto = new Map()
  for (const m of lib.movimientos) {
    if (m.anulado || m.tipo !== 'merma') continue
    const dia = lib.fechas.get(m.id)
    if (!dia || !enRango(dia, desde, hasta)) continue
    let acc = porProducto.get(m.productoId)
    if (!acc) {
      acc = { unidades: 0, valor: 0, motivos: new Map() }
      porProducto.set(m.productoId, acc)
    }
    acc.unidades += Math.abs(Number(m.cantidad) || 0)
    acc.valor += Math.abs(Number(m.importe) || 0)
    const motivo = String(m.motivo || '').trim()
    if (motivo) acc.motivos.set(motivo, (acc.motivos.get(motivo) || 0) + 1)
  }

  return [...porProducto.entries()]
    .map(([productoId, acc]) => ({
      nombre: lib.nombrePorProducto.get(productoId) ?? '—',
      valor: Math.round(acc.valor * 100) / 100,
      unidades: acc.unidades,
      // Con un solo motivo se lo lea en el rótulo: "Pan (se rompió)".
      motivo: acc.motivos.size === 1 ? [...acc.motivos.keys()][0] : `${acc.motivos.size} motivos`
    }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 12)
}

/** Dinero que entra por compras contra el que se pierde por mermas. */
async function _comprasVsMermas(opts, repos) {
  const lib = await cargarLibro(repos)
  const desde = opts.desde || ''
  const hasta = opts.hasta || ''

  const magnitudes = magnitudesPorTipo(
    lib.movimientos,
    lib.fechas,
    ['entrada', 'merma', 'devolucion']
  )
  const filas = []
  for (const [tipo, porDia] of magnitudes) {
    for (const [dia, acc] of porDia) {
      if (!enRango(dia, desde, hasta)) continue
      filas.push({ periodo: dia, tipo, valor: acc.valor })
    }
  }

  return sumarPorPeriodo(filas, opts.agrupacion || 'dia', (g) => {
    const de = t => g.filter(x => x.tipo === t).reduce((s, x) => s + x.valor, 0)
    return {
      compras: Math.round(de('entrada')),
      mermas: Math.round(de('merma')),
      devoluciones: Math.round(de('devolucion'))
    }
  })
}

/** Reposición del quiosco: cuánto se movió y cada cuánto se repone. */
async function _traspasosPorPeriodo(opts, repos) {
  const lib = await cargarLibro(repos)
  const desde = opts.desde || ''
  const hasta = opts.hasta || ''

  const filas = []
  for (const m of lib.movimientos) {
    if (m.anulado || m.tipo !== 'traspaso') continue
    const dia = lib.fechas.get(m.id)
    if (!dia || !enRango(dia, desde, hasta)) continue
    filas.push({
      periodo: dia,
      unidades: Math.abs(Number(m.cantidad) || 0),
      valor: Math.abs(Number(m.importe) || 0)
    })
  }
  return sumarPorPeriodo(filas, opts.agrupacion || 'dia', g => ({
    unidades: g.reduce((s, x) => s + x.unidades, 0),
    valor: Math.round(g.reduce((s, x) => s + x.valor, 0))
  }))
}

/**
 * Días que lleva cada producto sin recibir mercadería. Un producto al que nunca
 * se le traspasó nada cuenta desde su última entrada al almacén: "nunca
 * repuesto" es el peor caso, no cero días.
 */
async function _diasSinReponer(opts, repos) {
  const lib = await cargarLibro(repos)
  const h = hoy()
  const ultimoTraspaso = new Map()
  const ultimaEntrada = new Map()

  for (const m of lib.movimientos) {
    if (m.anulado) continue
    const dia = lib.fechas.get(m.id)
    if (!dia) continue
    const mapa = m.tipo === 'traspaso' ? ultimoTraspaso : (m.tipo === 'entrada' ? ultimaEntrada : null)
    if (!mapa) continue
    if (dia > (mapa.get(m.productoId) || '')) mapa.set(m.productoId, dia)
  }

  const filas = []
  for (const f of lib.vista) {
    const desde = ultimoTraspaso.get(f.productoId) || ultimaEntrada.get(f.productoId)
    if (!desde) continue
    const dias = diasHasta(h, desde)
    if (dias === null || dias < 0) continue
    filas.push({
      nombre: f.nombre,
      dias,
      nuncaRepuesto: ultimoTraspaso.has(f.productoId) ? 0 : 1,
      stockQuiosco: f.quiosco
    })
  }
  return filas.sort((a, b) => b.dias - a.dias).slice(0, 15)
}

/** ¿El quiosco se surtió con traspasos o se está vendiendo de más? */
async function _coberturaTraspasos(opts, repos) {
  const lib = await cargarLibro(repos)
  const desde = opts.desde || ''
  const hasta = opts.hasta || ''

  const entrada = new Map()
  const salida = new Map()
  for (const m of lib.movimientos) {
    if (m.anulado) continue
    const dia = lib.fechas.get(m.id)
    if (!dia || !enRango(dia, desde, hasta)) continue
    const cant = Math.abs(Number(m.cantidad) || 0)
    if (m.tipo === 'traspaso') entrada.set(dia, (entrada.get(dia) || 0) + cant)
    if (m.tipo === 'venta') {
      const d = -(Math.trunc(Number(m.deltaQuiosco) || 0))
      if (d > 0) salida.set(dia, (salida.get(dia) || 0) + d)
    }
  }

  const filas = []
  for (const dia of new Set([...entrada.keys(), ...salida.keys()])) {
    filas.push({
      periodo: dia,
      repuesto: entrada.get(dia) || 0,
      vendido: salida.get(dia) || 0
    })
  }
  return sumarPorPeriodo(filas, opts.agrupacion || 'dia', g => ({
    repuesto: g.reduce((s, x) => s + x.repuesto, 0),
    vendido: g.reduce((s, x) => s + x.vendido, 0)
  }))
}

/** Curva de capital: qué se compró contra lo que salió del almacén. */
async function _inversionAcumulada(opts, repos) {
  const lib = await cargarLibro(repos)
  const desde = opts.desde || ''
  const hasta = opts.hasta || ''

  const magnitudes = magnitudesPorTipo(lib.movimientos, lib.fechas, ['entrada', 'merma'])
  const filas = []
  for (const [tipo, porDia] of magnitudes) {
    for (const [dia, acc] of porDia) {
      if (!enRango(dia, desde, hasta)) continue
      filas.push({ periodo: dia, tipo, valor: acc.valor })
    }
  }
  // La venta no sale de "magnitudes": su importe ya es el costo FIFO del lote,
  // así que se toma el libro tal cual, sin promediar nada.
  for (const m of lib.movimientos) {
    if (m.anulado || m.tipo !== 'venta') continue
    const dia = lib.fechas.get(m.id)
    if (!dia || !enRango(dia, desde, hasta)) continue
    filas.push({ periodo: dia, tipo: 'venta', valor: Number(m.importe) || 0 })
  }

  const porPeriodo = sumarPorPeriodo(filas, opts.agrupacion || 'dia', g => ({
    compras: g.filter(x => x.tipo === 'entrada').reduce((s, x) => s + x.valor, 0),
    salidas: g.filter(x => x.tipo === 'venta' || x.tipo === 'merma').reduce((s, x) => s + x.valor, 0)
  }))

  // Acumulado: el capital no gastado sube al comprar y baja al vender.
  let acumuladoCompras = 0
  let acumuladoSalidas = 0
  return porPeriodo.map((p) => {
    acumuladoCompras += p.compras
    acumuladoSalidas += p.salidas
    return {
      periodo: p.periodo,
      invertido: Math.round(acumuladoCompras),
      recuperado: Math.round(acumuladoSalidas)
    }
  })
}

/** Reaperturas: cuánto se anuló y se rehízo al cerrar. Señal de calidad. */
async function _anulacionesPeriodo(opts, repos) {
  const lib = await cargarLibro(repos)
  const desde = opts.desde || ''
  const hasta = opts.hasta || ''

  const filas = []
  for (const m of lib.movimientos) {
    if (m.anulado || m.tipo !== 'anulacion') continue
    const dia = lib.fechas.get(m.id)
    if (!dia || !enRango(dia, desde, hasta)) continue
    filas.push({
      periodo: dia,
      unidades: Math.abs(Number(m.cantidad) || 0),
      valor: Math.abs(Number(m.importe) || 0)
    })
  }
  return sumarPorPeriodo(filas, opts.agrupacion || 'dia', g => ({
    unidades: g.reduce((s, x) => s + x.unidades, 0),
    valor: Math.round(g.reduce((s, x) => s + x.valor, 0))
  }))
}

/**
 * FIFO en la práctica: qué tan viejo era el lote que se vendió cada día.
 * Si el consumo no sigue el orden de antigüedad, el FIFO está roto.
 */
async function _fifoAntiguedadVendida(opts, repos) {
  if (!opts.productoId) return []
  const lib = await cargarLibro(repos)
  const desde = opts.desde || ''
  const hasta = opts.hasta || ''

  const porDia = new Map()
  for (const m of lib.movimientos) {
    if (m.anulado || m.productoId !== opts.productoId) continue
    if (m.tipo !== 'venta' && m.tipo !== 'anulacion') continue
    const dia = lib.fechas.get(m.id)
    if (!dia || !enRango(dia, desde, hasta)) continue
    const lote = m.loteId ? lib.lotePorId.get(m.loteId) : null
    if (!lote?.fechaEntrada) continue
    const dias = diasHasta(dia, aDia(lote.fechaEntrada))
    if (dias === null || dias < 0) continue
    const cant = Math.abs(Number(m.cantidad) || 0)
    let acc = porDia.get(dia)
    if (!acc) {
      acc = { suma: 0, unidades: 0 }
      porDia.set(dia, acc)
    }
    acc.suma += dias * cant
    acc.unidades += cant
  }

  return [...porDia.entries()]
    .map(([dia, acc]) => ({
      periodo: dia,
      diasAntiguedad: acc.unidades > 0 ? Math.round(acc.suma / acc.unidades) : 0
    }))
    .sort((a, b) => String(a.periodo).localeCompare(String(b.periodo)))
}

/** Precio de compra de un producto a lo largo del tiempo. */
async function _evolucionPrecioCompra(opts, repos) {
  if (!opts.productoId) return []
  const lib = await cargarLibro(repos)
  const desde = opts.desde || ''
  const hasta = opts.hasta || ''
  const producto = lib.productos.find(p => p.id === opts.productoId)

  const porPeriodo = new Map()
  for (const m of lib.movimientos) {
    if (m.anulado || m.tipo !== 'entrada' || m.productoId !== opts.productoId) continue
    const dia = lib.fechas.get(m.id)
    if (!dia || !enRango(dia, desde, hasta)) continue
    const periodo = clavePeriodo(dia, opts.agrupacion || 'dia')
    const cant = Math.abs(Number(m.cantidad) || 0)
    let acc = porPeriodo.get(periodo)
    if (!acc) {
      acc = { suma: 0, unidades: 0 }
      porPeriodo.set(periodo, acc)
    }
    acc.suma += (Number(m.precioUnitario) || 0) * cant
    acc.unidades += cant
  }

  return [...porPeriodo.entries()]
    .map(([periodo, acc]) => ({
      periodo,
      // Promedio ponderado por cantidad, que es como se pagó de verdad.
      precioCompra: acc.unidades > 0 ? Math.round((acc.suma / acc.unidades) * 100) / 100 : 0,
      precioVenta: Number(producto?.precioVentaActual) || 0
    }))
    .filter(f => f.precioCompra > 0)
    .sort((a, b) => String(a.periodo).localeCompare(String(b.periodo)))
}

/** A quién se le compra y cuánto: sirve para saber con quién negociar. */
async function _gastoPorProveedor(opts, repos) {
  const lib = await cargarLibro(repos)
  const desde = opts.desde || ''
  const hasta = opts.hasta || ''

  const porOrigen = new Map()
  for (const m of lib.movimientos) {
    if (m.anulado || m.tipo !== 'entrada') continue
    const dia = lib.fechas.get(m.id)
    if (!dia || !enRango(dia, desde, hasta)) continue
    const lote = m.loteId ? lib.lotePorId.get(m.loteId) : null
    const nombre = lote?.proveedorId
      ? (lib.nombrePorProveedor.get(lote.proveedorId) ?? '—')
      : (lote?.lugarCompra || 'Sin proveedor')
    let acc = porOrigen.get(nombre)
    if (!acc) {
      acc = { valor: 0, unidades: 0, entradas: new Set() }
      porOrigen.set(nombre, acc)
    }
    acc.valor += Math.abs(Number(m.importe) || 0)
    acc.unidades += Math.abs(Number(m.cantidad) || 0)
    acc.entradas.add(lote?.entradaRef ?? m.id)
  }

  return [...porOrigen.entries()]
    .map(([proveedor, acc]) => ({
      proveedor,
      valor: Math.round(acc.valor),
      entradas: acc.entradas.size,
      unidades: acc.unidades
    }))
    .sort((a, b) => b.valor - a.valor)
}

/** Precio medio pagado a cada proveedor por un producto: para negociar. */
async function _precioMedioProveedor(opts, repos) {
  if (!opts.productoId) return []
  const lib = await cargarLibro(repos)
  const desde = opts.desde || ''
  const hasta = opts.hasta || ''

  const porOrigen = new Map()
  for (const m of lib.movimientos) {
    if (m.anulado || m.tipo !== 'entrada' || m.productoId !== opts.productoId) continue
    const dia = lib.fechas.get(m.id)
    if (!dia || !enRango(dia, desde, hasta)) continue
    const lote = m.loteId ? lib.lotePorId.get(m.loteId) : null
    const nombre = lote?.proveedorId
      ? (lib.nombrePorProveedor.get(lote.proveedorId) ?? '—')
      : (lote?.lugarCompra || 'Sin proveedor')
    const cant = Math.abs(Number(m.cantidad) || 0)
    let acc = porOrigen.get(nombre)
    if (!acc) {
      acc = { suma: 0, unidades: 0 }
      porOrigen.set(nombre, acc)
    }
    acc.suma += (Number(m.precioUnitario) || 0) * cant
    acc.unidades += cant
  }

  return [...porOrigen.entries()]
    .map(([proveedor, acc]) => ({
      proveedor,
      precioMedio: acc.unidades > 0 ? Math.round((acc.suma / acc.unidades) * 100) / 100 : 0,
      unidades: acc.unidades
    }))
    .sort((a, b) => a.precioMedio - b.precioMedio)
}

/** Producto × día/semana: qué se vende cuando. */
async function _heatmapProductoDia(opts, repos) {
  const lib = await cargarLibro(repos)
  const desde = opts.desde || ''
  const hasta = opts.hasta || ''
  const agrupacion = opts.agrupacion || 'dia'

  // Solo los productos que más venden: 60 filas no se leen.
  const top = [...lib.resumenVentas.entries()]
    .sort((a, b) => b[1].unidades - a[1].unidades)
    .slice(0, 12)

  const filas = []
  for (const [productoId, s] of top) {
    if (s.unidades <= 0) continue
    const nombre = lib.nombrePorProducto.get(productoId) ?? '—'
    for (const [dia, unidades] of s.dias) {
      if (unidades <= 0 || !enRango(dia, desde, hasta)) continue
      filas.push({ periodo: clavePeriodo(dia, agrupacion), nombre, unidades })
    }
  }
  return filas.sort((a, b) => String(a.periodo).localeCompare(String(b.periodo)))
}

// ═══════════════════ Ganancia real (FIFO) vs. estimada ═════════════════════

/**
 * Ganancia y margen REALES por producto.
 *
 * El ingreso sale de lo que se cobró (líneas de cuadre cerradas + ventas
 * directas) y el costo del libro, que guarda el precio FIFO del lote que se
 * consumió. La gráfica 'productos-mayor-ganancia' estima ese costo con el
 * precio de compra de HOY: cuando el precio cambia, deja de cuadrar.
 *
 * @param {boolean} comoMargen — devuelve el porcentaje en vez del monto
 */
async function _gananciaRealFifo(opts, repos, comoMargen) {
  const lib = await cargarLibro(repos)
  const desde = opts.desde || ''
  const hasta = opts.hasta || ''

  // Ingreso por producto: cuadres cerrados en rango + ventas directas.
  const ingreso = new Map()
  const cuadresPorId = new Map()
  for (const c of lib.cuadres) {
    if (c.estado !== 'cerrado') continue
    const dia = aDia(c.fecha)
    if (!dia || !enRango(dia, desde, hasta)) continue
    cuadresPorId.set(c.id, dia)
  }
  for (const i of lib.items) {
    const dia = cuadresPorId.get(i.cuadreId)
    if (!dia) continue
    if ((Number(i.cantidad) || 0) <= 0) continue
    ingreso.set(i.productoId, (ingreso.get(i.productoId) || 0) + (Number(i.subtotal) || 0))
  }

  const ventasPorId = new Map()
  for (const v of lib.ventasDirectas) {
    if (v.anulado) continue
    const dia = aDia(v.creadoEn)
    if (!dia || !enRango(dia, desde, hasta)) continue
    ventasPorId.set(v.id, dia)
  }
  for (const it of lib.ventasDirectasItems) {
    const dia = ventasPorId.get(it.ventaDirectaId)
    if (!dia) continue
    ingreso.set(it.productoId, (ingreso.get(it.productoId) || 0) + (Number(it.subtotal) || 0))
  }

  // Costo FIFO en rango: el resumen es de todo el libro, así que se recorta
  // por día para no contar ventas de otros períodos.
  const costo = costoFifoEnRango(lib, desde, hasta)

  const filas = []
  for (const [productoId, ing] of ingreso) {
    const cst = costo.get(productoId) ?? 0
    const ganancia = ing - cst
    filas.push({
      nombre: lib.nombrePorProducto.get(productoId) ?? '—',
      valor: comoMargen
        ? (ing > 0 ? Math.round((ganancia / ing) * 1000) / 10 : 0)
        : Math.round(ganancia),
      ingreso: Math.round(ing),
      costo: Math.round(cst)
    })
  }

  return filas
    .filter(f => f.valor !== 0)
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 15)
}

/**
 * Costo FIFO de las ventas dentro del rango. El resumen por producto trae el
 * total de todo el libro, así que se reparte por día para poder recortar.
 */
function costoFifoEnRango(lib, desde, hasta) {
  const costo = new Map()
  for (const m of lib.movimientos) {
    if (m.anulado || m.tipo !== 'venta') continue
    const dia = lib.fechas.get(m.id)
    if (!dia || !enRango(dia, desde, hasta)) continue
    if ((Math.abs(Number(m.cantidad) || 0)) === 0) continue
    // El importe de un movimiento es el costo FIFO de ese lote: se suma tal
    // cual, sin repartir ni promediar.
    costo.set(m.productoId, (costo.get(m.productoId) || 0) + (Number(m.importe) || 0))
  }
  return costo
}

/**
 * Cuánto se desvía la estimación con precio de hoy respecto al FIFO real.
 * Positivo = la estimación subestima la ganancia; negativo, la infla.
 */
async function _diferenciaEstimadaReal(opts, repos) {
  const reales = await _gananciaRealFifo(opts, repos, false)
  const porNombre = new Map(reales.map(f => [f.nombre, f.valor]))

  // Se compara contra la MISMA base que usa la gráfica estimada, para que la
  // diferencia sea solo del costo y no del conjunto de datos.
  const estimado = await _productosMayorGanancia(opts, repos.productos, repos.cuadres, repos.items)

  return estimado
    .map((f) => {
      const real = porNombre.get(f.nombre) ?? 0
      return {
        nombre: f.nombre,
        // Positivo = el FIFO real deja más ganancia que la estimación con el
        // precio de compra de hoy; negativo, la estimación la inflaba.
        diferencia: real - f.gananciaTotal,
        estimado: f.gananciaTotal,
        real
      }
    })
    .filter(f => f.diferencia !== 0)
    .sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia))
    .slice(0, 15)
}

// ═════════════════════════════════ Deudas ═══════════════════════════════════

/** Tramos de antigüedad de la cartera, en días desde que se fió. */
const TRAMOS_CARTERA = [
  { estado: 'Al día', max: 30 },
  { estado: '1 a 30 días', max: 60 },
  { estado: '31 a 60 días', max: 90 },
  { estado: 'Más de 90 días', max: Infinity }
]

function saldoDe(cuenta) {
  return (Number(cuenta.montoTotal) || 0) - (Number(cuenta.montoPagado) || 0)
}

/** Quién debe y cuánto. Solo lo que está pendiente de verdad. */
async function _deudaPorCliente(opts, cuentasRepo, usuariosRepo) {
  const [cuentas, usuarios] = await Promise.all([
    cuentasRepo.readAll(),
    usuariosRepo.readAll()
  ]).then(rs => rs.map(fila))

  const nombrePorUsuario = new Map(usuarios.map(u => [u.id, u.nombre]))
  const porCliente = new Map()

  for (const c of cuentas) {
    const saldo = saldoDe(c)
    if (saldo <= 0) continue
    porCliente.set(c.clienteId, (porCliente.get(c.clienteId) || 0) + saldo)
  }

  return [...porCliente.entries()]
    .map(([clienteId, saldo]) => ({
      nombre: nombrePorUsuario.get(clienteId) ?? 'Cliente',
      saldo: Math.round(saldo)
    }))
    .sort((a, b) => b.saldo - a.saldo)
    .slice(0, 12)
}

/**
 * Aging de la cartera: qué parte de lo que se debe lleva mucho tiempo parado.
 * El tramo "Al día" va hasta 30 días, que es el crédito normal del negocio.
 */
async function _antiguedadCartera(opts, cuentasRepo) {
  const cuentas = fila(await cuentasRepo.readAll())

  const h = hoy()
  const conteo = TRAMOS_CARTERA.map(t => ({ estado: t.estado, saldo: 0 }))
  let total = 0

  for (const c of cuentas) {
    const saldo = saldoDe(c)
    if (saldo <= 0) continue
    const dias = diasHasta(h, aDia(c.creadoEn))
    const antiguedad = dias !== null && dias > 0 ? dias : 0
    const i = TRAMOS_CARTERA.findIndex(t => antiguedad <= t.max)
    const destino = i === -1 ? conteo.length - 1 : i
    conteo[destino].saldo += saldo
    total += saldo
  }

  return conteo
    .filter(c => c.saldo > 0)
    .map(c => ({ forma: c.estado, saldo: Math.round(c.saldo), total }))
}

/** Lo que se fio contra lo que se cobró: si la cartera crece o se cierra. */
async function _cobradoVsFiado(opts, pagosRepo, cuentasRepo) {
  const [pagos, cuentas] = await Promise.all([
    pagosRepo.readAll(),
    cuentasRepo.readAll()
  ]).then(rs => rs.map(fila))

  const desde = opts.desde || ''
  const hasta = opts.hasta || ''
  const filas = []

  for (const c of cuentas) {
    const dia = aDia(c.creadoEn)
    if (!dia || !enRango(dia, desde, hasta)) continue
    filas.push({ periodo: dia, fiado: Number(c.montoTotal) || 0, cobrado: 0 })
  }
  for (const p of pagos) {
    const dia = aDia(p.creadoEn)
    if (!dia || !enRango(dia, desde, hasta)) continue
    filas.push({ periodo: dia, fiado: 0, cobrado: Number(p.monto) || 0 })
  }

  return sumarPorPeriodo(filas, opts.agrupacion || 'dia', g => ({
    fiado: Math.round(g.reduce((s, x) => s + x.fiado, 0)),
    cobrado: Math.round(g.reduce((s, x) => s + x.cobrado, 0))
  }))
}
