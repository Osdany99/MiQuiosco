/**
 * app/utils/libro.js — El libro de inventario del puesto, leído una vez.
 *
 * Movimientos, lotes, traspasos, cuadres y líneas, más todo lo derivado de
 * ellos. Lo usan las gráficas (/graficas) y el historial del quiosco
 * (/historial-quiosco), que son dos vistas del mismo dato.
 *
 * Por qué existe: el libro es append-only y el CRUD no admite rangos (solo
 * igualdad por columna), así que no hay forma de traer "solo este mes": o se
 * trae el libro entero o nada. Traerlo entero en cada gráfica, en cada clic de
 * Actualizar y en cada cambio de mes de la otra vista sería absurdo, así que se
 * lee una vez por puesto+modo y se reutiliza.
 *
 * Se invalida a mano (botón Actualizar, o tras sincronizar) con
 * limpiarCacheLibro().
 */
import { TABLES } from '../../shared/tables'
import { indiceFechasNegocio, resumenVentas } from '../../shared/inventario/analitica'
import { saldosPorProducto } from '../../shared/inventario/operaciones'
import { saldosDesdeMovimientos } from '../../shared/inventario/fifo'
import { vistaSaldos } from '../../shared/inventario/vista'

const cuadreConfig = TABLES.cuadres
const cuadreItemConfig = TABLES.cuadre_items
const productoConfig = TABLES.productos
const usuarioConfig = TABLES.usuarios
const proveedorConfig = TABLES.proveedores
const loteConfig = TABLES.lotes
const traspasoConfig = TABLES.traspasos
const movimientoConfig = TABLES.movimientos_inventario
const ventasDirectasConfig = TABLES.ventas_directas
const ventasDirectasItemsConfig = TABLES.ventas_directas_items

/**
 * Repos del libro.
 *
 * Se crean aquí (y no al principio de calcularGrafica) para que una gráfica de
 * ventas no abra diez repos que no va a usar.
 */
export function reposLibro() {
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

function fila(x) {
  return Array.isArray(x) ? x : (x?.data ?? [])
}

/** Cache del libro en memoria de módulo. Ver la nota de la cabecera. */
let cacheLibro = null

export function limpiarCacheLibro() {
  cacheLibro = null
}

/**
 * El libro del puesto, ya cacheado por puesto+modo de conexión.
 *
 * Trae los datos crudos más lo derivado: fechas de negocio, saldos por
 * producto, saldos por lote, nombres, la vista valorizada (la misma de /almacen
 * y /quiosco) y el resumen de ventas.
 *
 * @param {object} [repos] — juegos de reposAlternativos; por defecto los de
 *   reposLibro(). Sirve para no abrir repos que la vista no va a usar.
 */
export async function leerLibro(repos = reposLibro()) {
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
