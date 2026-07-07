const cuadre = ref(null)
const lineas = ref([])
const productosActivos = ref([])
const cargando = ref(false)
const showImportar = ref(false)
const showAgregarProducto = ref(false)
const productoSeleccionado = ref('')
const expandida = ref(new Set())

const totalRealCaja = ref(null)
const montoTransferencia = ref(0)
const montoFiado = ref(0)
const trabajadorTurnoId = ref(null)
const pagoTrabajador = ref(null)
const notasCuadre = ref('')

const hoy = new Date().toISOString().split('T')[0]

const totalEsperado = computed(() =>
  lineas.value.reduce((sum, l) => sum + l.subtotal, 0)
)

const diferencia = computed(() => {
  if (totalRealCaja.value === null) return null
  return (totalRealCaja.value + montoTransferencia.value) - totalEsperado.value
})

const tipoDiferencia = computed(() => {
  if (diferencia.value === null) return null
  if (diferencia.value === 0) return 'exacto'
  return diferencia.value > 0 ? 'sobrante' : 'faltante'
})

function normalizarCuadre(c) {
  if (!c) return c
  return {
    id: c.id,
    puestoId: c.puesto_id ?? c.puestoId,
    jefeId: c.jefe_id ?? c.jefeId,
    fecha: c.fecha,
    estado: c.estado,
    totalEsperado: Number(c.total_esperado ?? c.totalEsperado ?? 0),
    totalRealCaja: c.total_real_caja ?? c.totalRealCaja ?? null,
    montoTransferencia: Number(c.monto_transferencia ?? c.montoTransferencia ?? 0),
    montoFiado: Number(c.monto_fiado ?? c.montoFiado ?? 0),
    diferencia: c.diferencia ?? null,
    trabajadorTurnoId: c.trabajador_turno_id ?? c.trabajadorTurnoId ?? null,
    pagoTrabajador: c.pago_trabajador ?? c.pagoTrabajador ?? null,
    notas: c.notas ?? null,
    cerradoEn: c.cerrado_en ?? c.cerradoEn ?? null,
    reabiertoVeces: Number(c.reabierto_veces ?? c.reabiertoVeces ?? 0),
    ultimaReaperturaEn: c.ultima_reapertura_en ?? c.ultimaReaperturaEn ?? null,
    creadoEn: c.creado_en ?? c.creadoEn ?? Date.now(),
    actualizadoEn: c.actualizado_en ?? c.actualizadoEn ?? Date.now(),
    sincronizado: c.sincronizado ?? 0
  }
}

function normalizarLinea(i) {
  return {
    id: i.id,
    cuadreId: i.cuadre_id ?? i.cuadreId,
    productoId: i.producto_id ?? i.productoId,
    precioVentaUsado: Number(i.precio_venta_usado ?? i.precioVentaUsado ?? 0),
    cantidad: Number(i.cantidad ?? 0),
    subtotal: Number(i.subtotal ?? 0),
    tipoLinea: i.tipo_linea ?? i.tipoLinea ?? 'normal',
    nota: i.nota ?? null,
    esExtra: i.es_extra ?? i.esExtra ?? false
  }
}

export function useCuadre() {
  const auth = useAuth()
  const localDb = useLocalDb()
  const conexion = useModoConexion()
  const toast = useToast()

  const cuadreRepo = computed(() =>
    conexion.modo.value === 'online'
      ? useRemoteRepo('cuadres')
      : useLocalRepo('cuadres')
  )

  const itemsRepo = computed(() =>
    conexion.modo.value === 'online'
      ? useRemoteRepo('cuadre_items')
      : useLocalRepo('cuadre_items')
  )

  const productRepo = computed(() =>
    conexion.modo.value === 'online'
      ? useRemoteRepo('productos')
      : null
  )

  const esTrabajador = computed(() => auth.esTrabajador)

  async function cargarDatos(puestoId) {
    cargando.value = true
    try {
      if (!puestoId) return

      if (conexion.modo.value === 'online') {
        const allProds = await productRepo.value.readAll()
        productosActivos.value = allProds
          .filter(p => p.activo)
          .map(p => ({
            id: p.id,
            nombre: p.nombre,
            precioVentaActual: Number(p.precioVentaActual),
            orden: Number(p.orden ?? 0)
          }))
      } else {
        const prods = await localDb.getProductosActivos(puestoId)
        productosActivos.value = prods.map(p => ({
          id: p.id,
          nombre: p.nombre,
          precioVentaActual: p.precioVentaActual,
          orden: p.orden
        }))
      }

      let c = await buscarCuadreActual(puestoId)
      if (!c) {
        c = await crearCuadreNuevo(puestoId)
      }

      cuadre.value = c
      await cargarLineasDeCuadre(c.id)

      if (c.totalRealCaja != null) totalRealCaja.value = Number(c.totalRealCaja)
      if (c.montoTransferencia != null) montoTransferencia.value = Number(c.montoTransferencia)
      if (c.montoFiado != null) montoFiado.value = Number(c.montoFiado)
      if (c.trabajadorTurnoId != null) trabajadorTurnoId.value = c.trabajadorTurnoId
      if (c.pagoTrabajador != null) pagoTrabajador.value = Number(c.pagoTrabajador)
      if (c.notas != null) notasCuadre.value = c.notas ?? ''
    } catch (err) {
      toast.add({ title: 'Error', description: err.message || 'No se pudo cargar el cuadre.', color: 'error' })
    } finally {
      cargando.value = false
    }
  }

  async function buscarCuadreActual(puestoId) {
    const todos = await cuadreRepo.value.readAll()
    const encontrado = todos.find(c => {
      const n = normalizarCuadre(c)
      return n.puestoId === puestoId && n.fecha === hoy
    })
    return encontrado ? normalizarCuadre(encontrado) : null
  }

  async function cargarLineasDeCuadre(cuadreId) {
    const items = await itemsRepo.value.readAll()
    const itemsFiltrados = items.filter(i => {
      const n = normalizarLinea(i)
      return n.cuadreId === cuadreId
    })
    if (itemsFiltrados.length > 0) {
      lineas.value = itemsFiltrados.map(normalizarLinea)
    } else {
      lineas.value = productosActivos.value.map(prod => ({
        id: crypto.randomUUID(),
        cuadreId,
        productoId: prod.id,
        precioVentaUsado: prod.precioVentaActual,
        cantidad: 0,
        subtotal: 0,
        tipoLinea: 'normal',
        nota: null,
        esExtra: false
      }))
    }
  }

  async function crearCuadreNuevo(puestoId) {
    const nuevoId = crypto.randomUUID()
    const cuadreObj = {
      id: nuevoId,
      puestoId,
      jefeId: auth.usuarioActual.value?.id,
      fecha: hoy,
      estado: 'abierto',
      totalEsperado: 0,
      totalRealCaja: null,
      montoTransferencia: 0,
      montoFiado: 0,
      diferencia: null,
      trabajadorTurnoId: null,
      pagoTrabajador: null,
      notas: null,
      cerradoEn: null,
      reabiertoVeces: 0,
      ultimaReaperturaEn: null
    }
    await cuadreRepo.value.create(cuadreObj)
    return cuadreObj
  }

  function recalcularSubtotal(linea) {
    linea.subtotal = linea.precioVentaUsado * linea.cantidad
  }

  async function agregarLineaExtra() {
    if (!productoSeleccionado.value) {
      toast.add({ title: 'Selecciona un producto', color: 'warning' })
      return
    }
    const prod = productosActivos.value.find(p => p.id === productoSeleccionado.value)
    if (!prod) return

    lineas.value.push({
      id: crypto.randomUUID(),
      cuadreId: cuadre.value.id,
      productoId: prod.id,
      precioVentaUsado: prod.precioVentaActual,
      cantidad: 1,
      subtotal: prod.precioVentaActual,
      tipoLinea: 'normal',
      nota: null,
      esExtra: true
    })
    productoSeleccionado.value = ''
    showAgregarProducto.value = false
  }

  function toggleExpandir(lineaId) {
    if (expandida.value.has(lineaId)) {
      expandida.value.delete(lineaId)
    } else {
      expandida.value.add(lineaId)
    }
  }

  async function cerrarCuadre() {
    if (esTrabajador.value) {
      toast.add({ title: 'Solo el jefe puede cerrar el cuadre', color: 'error' })
      return
    }

    if (totalRealCaja.value === null) {
      toast.add({ title: 'Debes ingresar el dinero real en caja.', color: 'warning' })
      return
    }

    if (!cuadre.value) return

    const diff = diferencia.value ?? 0
    const tipo = tipoDiferencia.value

    try {
      const cambios = {
        estado: 'cerrado',
        totalEsperado,
        totalRealCaja: totalRealCaja.value,
        montoTransferencia: montoTransferencia.value,
        montoFiado: montoFiado.value,
        diferencia: diff,
        trabajadorTurnoId: trabajadorTurnoId.value,
        pagoTrabajador: pagoTrabajador.value,
        notas: notasCuadre.value,
        cerradoEn: Date.now()
      }

      await cuadreRepo.value.update(cuadre.value.id, cambios)
      cuadre.value = { ...cuadre.value, ...cambios }

      const existentes = await itemsRepo.value.readAll()
      for (const item of existentes.filter(i => {
        const n = normalizarLinea(i)
        return n.cuadreId === cuadre.value.id
      })) {
        await itemsRepo.value.remove(item.id)
      }
      for (const linea of lineas.value) {
        await itemsRepo.value.create({
          cuadreId: linea.cuadreId,
          productoId: linea.productoId,
          precioVentaUsado: linea.precioVentaUsado,
          cantidad: linea.cantidad,
          subtotal: linea.subtotal,
          tipoLinea: linea.tipoLinea,
          nota: linea.nota,
          esExtra: linea.esExtra
        })
      }

      let mensaje = 'Cuadre cerrado: '
      if (tipo === 'exacto') mensaje += 'todo correcto, caja exacta.'
      else if (tipo === 'sobrante') mensaje += `sobrante de ${fmtMoneda(diff)}.`
      else mensaje += `faltante de ${fmtMoneda(-diff)}.`

      toast.add({
        title: 'Cuadre cerrado',
        description: mensaje,
        color: tipo === 'exacto' ? 'success' : tipo === 'sobrante' ? 'info' : 'error'
      })
    } catch (err) {
      toast.add({ title: 'Error', description: err.message, color: 'error' })
    }
  }

  async function reabrirCuadre() {
    if (esTrabajador.value) {
      toast.add({ title: 'Solo el jefe puede reabrir el cuadre', color: 'error' })
      return
    }

    if (!cuadre.value || cuadre.value.estado !== 'cerrado') return

    const reabiertoVeces = (cuadre.value.reabiertoVeces ?? 0) + 1
    await cuadreRepo.value.update(cuadre.value.id, {
      estado: 'abierto',
      reabiertoVeces,
      ultimaReaperturaEn: Date.now()
    })
    cuadre.value = {
      ...cuadre.value,
      estado: 'abierto',
      reabiertoVeces,
      ultimaReaperturaEn: Date.now()
    }
    toast.add({ title: 'Cuadre reabierto', description: 'Ahora puedes editarlo nuevamente.', color: 'info' })
  }

  function importarRegistroTrabajador() {
    toast.add({ title: 'Función en desarrollo', description: 'Selector de archivo JSON próximamente.', color: 'info' })
    showImportar.value = false
  }

  function fmtMoneda(v) {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'CUP', minimumFractionDigits: 0 }).format(v)
  }

  function getProductoNombre(productoId) {
    return productosActivos.value.find(p => p.id === productoId)?.nombre || '—'
  }

  return {
    cuadre, lineas, productosActivos, cargando,
    showImportar, showAgregarProducto, productoSeleccionado, expandida,
    totalRealCaja, montoTransferencia, montoFiado,
    trabajadorTurnoId, pagoTrabajador, notasCuadre,
    totalEsperado, diferencia, tipoDiferencia, esTrabajador,
    cargarDatos, recalcularSubtotal,
    agregarLineaExtra, toggleExpandir, cerrarCuadre, reabrirCuadre,
    importarRegistroTrabajador, fmtMoneda, getProductoNombre,
    hoy
  }
}
