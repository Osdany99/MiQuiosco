/**
 * useVistaInventario — Estado de una vista de inventario por ubicación.
 *
 * Compartido por /quiosco y /almacen: solo cambia qué columna se muestra y qué
 * acciones aplican. Evita duplicar la carga de saldos, lotes y proveedores.
 *
 * El estado de cada fila (OK / Reponer / Bajo mínimo / No se vende) NO se
 * calcula aquí: lo trae shared/inventario/analitica.js, que es el mismo que
 * usan las gráficas. Si divergieran, la tabla y la gráfica dirían cosas
 * distintas del mismo producto.
 */
import { estadoDeFila } from '../../shared/inventario/analitica'

const COLOR_POR_ESTADO = {
  'ok': 'success',
  'reponer': 'warning',
  'bajo-minimo': 'error',
  'no-se-vende': 'neutral'
}

export function useVistaInventario(ubicacion) {
  const inv = useInventario()

  const esQuiosco = computed(() => ubicacion === 'quiosco')

  const cargando = ref(true)
  const saldos = ref([])
  const lotesHistorial = ref([])
  const productosActivos = ref([])

  const showAjuste = ref(false)
  const showLotes = ref(false)
  const productoAjuste = ref(null)
  const productoLotes = ref(null)

  // Venta fuera de cuadre: efectivo o fiado del producto de la fila tocada.
  // El estado vive aquí porque /quiosco y /almacen comparten este composable.
  const showVenta = ref(false)
  const modoVenta = ref('venta')
  const productoVenta = ref(null)

  const columns = computed(() => [
    { accessorKey: 'nombre', header: 'Producto' },
    { accessorKey: esQuiosco.value ? 'quiosco' : 'almacen', header: 'Stock' },
    { accessorKey: esQuiosco.value ? 'stockMinimoQuiosco' : 'stockMinimoAlmacen', header: 'Mín' },
    ...(esQuiosco.value ? [{ accessorKey: 'stockRecomendadoQuiosco', header: 'Recomendado' }] : []),
    { accessorKey: 'costoActual', header: 'Costo' },
    { accessorKey: esQuiosco.value ? 'valorizadoQuiosco' : 'valorizadoAlmacen', header: 'Valorizado' },
    { accessorKey: 'estado', header: 'Estado' },
    { accessorKey: 'acciones', header: '' }
  ])

  /**
   * Selector de columnas. Producto y Stock son las que se ven de entrada;
   * 'acciones' es estructural (header vacío) y por eso nunca entra al selector
   * ni se puede apagar. Misma regla que usa BaseTable (esColumnaEstructural).
   */
  const COLUMNAS_POR_DEFECTO = ['Producto', 'Stock']

  const visibleHeaders = ref(COLUMNAS_POR_DEFECTO)

  const columnHeaders = computed(() =>
    columns.value.filter(c => c.header).map(c => c.header)
  )

  const visibleColumns = computed(() =>
    columns.value.filter(c => !c.header || visibleHeaders.value.includes(c.header))
  )

  const columnsHistorial = [
    { accessorKey: 'fechaEntrada', header: 'Fecha' },
    { accessorKey: 'nombreProducto', header: 'Producto' },
    { accessorKey: 'cantidadInicial', header: 'Cant.' },
    { accessorKey: 'precioUnitario', header: 'P. compra' },
    { accessorKey: 'valor', header: 'Valor' },
    { accessorKey: 'origen', header: 'Origen' },
    { accessorKey: 'detalleCompra', header: 'Detalle' }
    // 'origen' muestra el proveedor (o el lugar de compra). El dato se sigue
    // calculando en cada fila; solo se oculta la columna. Ver app/utils/flags.js
  ].filter(c => MOSTRAR_PROVEEDOR || c.accessorKey !== 'origen')

  /**
   * En /quiosco sale lo mismo que en el cuadre: un producto con 'Vende' apagado
   * no se lista, tenga stock o no. /almacen sí lo muestra completo, porque allí
   * sigue siendo mercancía del puesto y hay que poder devolverlo o ajustarlo.
   */
  const filas = computed(() =>
    esQuiosco.value ? saldos.value.filter(f => f.seVende !== false) : saldos.value
  )

  // Del estado de cada fila decide la regla compartida de estadoDeFila (la
  // misma que usan /graficas). Su rama 'no-se-vende' ya no aparece en la tabla
  // de /quiosco porque esas filas se filtran arriba, pero sigue viva en las
  // gráficas.
  function estado(fila) {
    return estadoDeFila(fila, esQuiosco.value ? 'quiosco' : 'almacen')
  }

  function colorEstado(fila) {
    return COLOR_POR_ESTADO[estado(fila).estado]
  }

  function textoEstado(fila) {
    return estado(fila).texto
  }

  function abrirAjuste(productoId) {
    productoAjuste.value = productoId
    showAjuste.value = true
  }

  function abrirLotes(fila) {
    productoLotes.value = { id: fila.productoId, nombre: fila.nombre, descripcion: fila.descripcion ?? null }
    showLotes.value = true
  }

  /** Venta directa (efectivo) o deuda directa (fiado) del producto de la fila. */
  function abrirVenta(fila, modo = 'venta') {
    productoVenta.value = fila
    modoVenta.value = modo
    showVenta.value = true
  }

  const sinMovimientos = computed(() => !cargando.value && lotesHistorial.value.length === 0)

  /** Sin productos no hay entrada posible: la vista vacía debe apuntar a /productos. */
  const hayProductos = computed(() => !cargando.value && productosActivos.value.length > 0)

  async function recargar() {
    cargando.value = true
    try {
      saldos.value = await inv.cargarSaldos() ?? []
      const [lotesRows, prods, provs] = await Promise.all([
        inv.cargarLotes().catch(() => []),
        inv.cargarProductos().catch(() => []),
        inv.cargarProveedores().catch(() => [])
      ])
      const nombreProd = new Map((prods ?? []).map(p => [p.id, p.nombre]))
      const descripcionProd = new Map((prods ?? []).map(p => [p.id, p.descripcion ?? null]))
      const nombreProv = new Map((provs ?? []).map(p => [p.id, p.nombre]))
      lotesHistorial.value = (lotesRows ?? [])
        .slice()
        .sort((a, b) => String(b.fechaEntrada ?? '').localeCompare(String(a.fechaEntrada ?? '')))
        .map(l => ({
          ...l,
          nombreProducto: nombreProd.get(l.productoId) ?? '—',
          descripcionProducto: descripcionProd.get(l.productoId) ?? null,
          origen: l.proveedorId ? (nombreProv.get(l.proveedorId) ?? '—') : (l.lugarCompra || '—')
        }))
      productosActivos.value = prods ?? []
    } finally {
      cargando.value = false
    }
  }

  onMounted(recargar)

  return {
    inv,
    esQuiosco,
    cargando,
    saldos,
    filas,
    lotesHistorial,
    columns,
    columnsHistorial,
    visibleHeaders,
    columnHeaders,
    visibleColumns,
    colorEstado,
    textoEstado,
    abrirAjuste,
    abrirLotes,
    abrirVenta,
    recargar,
    sinMovimientos,
    hayProductos,
    showAjuste,
    showLotes,
    productoAjuste,
    productoLotes,
    showVenta,
    modoVenta,
    productoVenta
  }
}
