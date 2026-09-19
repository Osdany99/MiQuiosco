import { useDb } from '../server-offline/db/client'
import { TABLES } from '../../shared/tables'
import { generateId } from '~/utils/id'

const cuadreConfig = TABLES.cuadres
const cuadreItemConfig = TABLES.cuadre_items
const productoConfig = TABLES.productos
const usuarioConfig = TABLES.usuarios

function tsToEpoch(v) {
  if (v == null) return null
  const n = typeof v === 'number' ? v : Date.parse(v)
  return Number.isNaN(n) ? null : n
}

function normalizarCuadre(c) {
  if (!c) return c
  return {
    id: c.id,
    puestoId: c.puestoId,
    jefeId: c.jefeId,
    fecha: c.fecha,
    estado: c.estado,
    totalEsperado: Number(c.totalEsperado ?? 0),
    totalRealCaja: c.totalRealCaja ?? null,
    montoTransferencia: Number(c.montoTransferencia ?? 0),
    montoFiado: Number(c.montoFiado ?? 0),
    montoCobradoFiado: Number(c.montoCobradoFiado ?? 0),
    montoRegalo: Number(c.montoRegalo ?? 0),
    montoDescuento: Number(c.montoDescuento ?? 0),
    diferencia: c.diferencia ?? null,
    trabajadorTurnoId: c.trabajadorTurnoId ?? null,
    pagoTrabajador: c.pagoTrabajador ?? null,
    notas: c.notas ?? null,
    cerradoEn: tsToEpoch(c.cerradoEn),
    reabiertoVeces: Number(c.reabiertoVeces ?? 0),
    ultimaReaperturaEn: tsToEpoch(c.ultimaReaperturaEn),
    creadoEn: c.creadoEn ?? Date.now(),
    actualizadoEn: c.actualizadoEn ?? Date.now(),
    sincronizado: c.sincronizado ?? 0
  }
}
function normalizarLinea(i) {
  return {
    id: i.id,
    cuadreId: i.cuadreId,
    productoId: i.productoId,
    precioVentaUsado: Number(i.precioVentaUsado ?? 0),
    cantidad: Number(i.cantidad ?? 0),
    subtotal: Number(i.subtotal ?? 0),
    tipoLinea: i.tipoLinea ?? 'normal',
    nota: i.nota ?? null,
    esExtra: i.esExtra ?? false,
    creadoEn: i.creadoEn ?? null,
    actualizadoEn: i.actualizadoEn ?? null
  }
}

export function useCuadre() {
  const auth = useAuth()
  const db = useDb()
  const conexion = useModoConexion()
  const toast = useToast()

  const cuadreRepo = useRepo(cuadreConfig)
  const itemsRepo = useRepo(cuadreItemConfig)
  const usuariosRepo = useRepo(usuarioConfig)

  const cuadre = useState('cuadre-cuadre', () => null)
  const lineas = useState('cuadre-lineas', () => [])
  const productosActivos = useState('cuadre-productos-activos', () => [])
  const cargando = useState('cuadre-cargando', () => false)
  const totalRealCaja = useState('cuadre-total-real-caja', () => null)
  const montoTransferencia = useState('cuadre-monto-transferencia', () => 0)
  const montoFiado = useState('cuadre-monto-fiado', () => 0)
  const montoCobradoFiado = useState('cuadre-monto-cobrado-fiado', () => 0)
  const montoRegalo = useState('cuadre-monto-regalo', () => 0)
  const montoDescuento = useState('cuadre-monto-descuento', () => 0)
  const trabajadorTurnoId = useState('cuadre-trabajador-turno-id', () => null)
  const pagoTrabajador = useState('cuadre-pago-trabajador', () => null)
  const notasCuadre = useState('cuadre-notas', () => '')
  const salarioBaseTrabajador = useState('cuadre-salario-base', () => 600)

  const expandida = reactive(new Set())

  const hoy = new Date().toISOString().split('T')[0]

  const esTrabajador = computed(() => auth.esTrabajador.value)

  const totalEsperado = computed(() =>
    lineas.value.reduce((sum, l) => sum + l.subtotal, 0)
    - montoRegalo.value - montoDescuento.value
  )

  const salarioCalculado = computed(() =>
    calcularSalario(salarioBaseTrabajador.value, totalEsperado.value)
  )

  const faltanteReal = computed(() => {
    if (totalRealCaja.value === null) return null
    return totalEsperado.value - totalRealCaja.value - montoTransferencia.value - montoFiado.value
  })

  const diferencia = computed(() => {
    if (totalRealCaja.value === null) return null
    return (totalRealCaja.value + montoTransferencia.value + montoCobradoFiado.value) - totalEsperado.value
  })

  const tipoDiferencia = computed(() => {
    if (diferencia.value === null) return null
    if (Math.abs(diferencia.value) < 0.005) return 'exacto'
    return diferencia.value > 0 ? 'sobrante' : 'faltante'
  })

  const tituloCuadre = computed(() => {
    const fechaStr = cuadre.value?.fecha || hoy
    const d = new Date(fechaStr + 'T12:00:00')
    return 'Cuadre del día ' + d.toLocaleDateString('es-ES', { weekday: 'long' })
  })

  watch(trabajadorTurnoId, async (nuevoId) => {
    await cargarSalarioTrabajador(nuevoId)
    // Solo auto-rellena si está vacío: respeta el pago manual restaurado.
    if (nuevoId) {
      if (pagoTrabajador.value == null) pagoTrabajador.value = salarioCalculado.value
    } else {
      pagoTrabajador.value = null
    }
  })

  async function cargarDatos(puestoId, cuadreId) {
    cargando.value = true
    suprimirAutosave = true
    try {
      if (!puestoId) {
        toast.add({ title: 'Configuración incompleta', description: 'No tienes un puesto asignado. Contacta al administrador.', color: 'warning' })
        return
      }

      await conexion.cargar().catch(() => {})
      const modo = conexion.modo.value

      // Carga de productos: en online usamos el repo remoto; en local usamos
      // getProductosActivos() que filtra directamente en SQLite por puestoId.
      if (modo === 'online') {
        const allProds = await useRemoteRepo(productoConfig).readAll()
        productosActivos.value = allProds
          .filter(p => p.activo)
          .map(p => ({
            id: p.id,
            nombre: p.nombre,
            precioVentaActual: Number(p.precioVentaActual),
            orden: Number(p.orden ?? 0)
          }))
      } else {
        const prods = await db.getProductosActivos(puestoId)
        productosActivos.value = prods.map(p => ({
          id: p.id,
          nombre: p.nombre,
          precioVentaActual: p.precioVentaActual,
          orden: p.orden
        }))
      }

      let c
      const esHistorico = !!cuadreId
      if (cuadreId) {
        const { data } = await cuadreRepo.read(cuadreId)
        c = data ? normalizarCuadre(data) : null
      } else {
        c = await buscarCuadreActual(puestoId, cuadreRepo)
        if (!c) c = await crearCuadreNuevo(puestoId, cuadreRepo)
      }

      if (!c) {
        toast.add({ title: 'Cuadre no encontrado', color: 'error' })
        return
      }

      cuadre.value = c
      await cargarLineasDeCuadre(c.id, itemsRepo, !esHistorico)

      // Los montos de cierre solo se restauran en cuadres cerrados (histórico).
      // Los montos de cierre se restauran siempre del registro: con el
      // autoguardado son el borrador actual (reabrir limpia el registro,
      // así que no resucita dinero viejo).
      if (c.totalRealCaja != null) totalRealCaja.value = Number(c.totalRealCaja)
      else totalRealCaja.value = null
      if (c.montoTransferencia != null) montoTransferencia.value = Number(c.montoTransferencia)
      else montoTransferencia.value = 0
      if (c.pagoTrabajador != null) {
        pagoTrabajador.value = Number(c.pagoTrabajador)
      } else if (trabajadorTurnoId.value) {
        pagoTrabajador.value = salarioCalculado.value
      } else {
        pagoTrabajador.value = null
      }
      if (c.notas != null) notasCuadre.value = c.notas ?? ''
      if (c.montoFiado != null) montoFiado.value = Number(c.montoFiado)
      if (c.montoCobradoFiado != null) montoCobradoFiado.value = Number(c.montoCobradoFiado)
      if (c.montoRegalo != null) montoRegalo.value = Number(c.montoRegalo)
      else montoRegalo.value = 0
      if (c.montoDescuento != null) montoDescuento.value = Number(c.montoDescuento)
      else montoDescuento.value = 0
      if (c.trabajadorTurnoId != null) {
        trabajadorTurnoId.value = c.trabajadorTurnoId
        await cargarSalarioTrabajador(c.trabajadorTurnoId)
      }
    } catch (err) {
      toast.add({ title: 'Error', description: err.message || 'No se pudo cargar el cuadre.', color: 'error' })
    } finally {
      cargando.value = false
      // Reanudar autosave en el próximo tick: evita que la restauración
      // dispare un guardado inmediato de los mismos valores.
      setTimeout(() => {
        suprimirAutosave = false
      }, 0)
    }
  }

  async function cargarSalarioTrabajador(usuarioId) {
    if (!usuarioId) {
      salarioBaseTrabajador.value = 600
      return
    }
    try {
      const user = await usuariosRepo.read(usuarioId)
      salarioBaseTrabajador.value = user?.salario ?? 600
    } catch {
      salarioBaseTrabajador.value = 600
    }
  }

  async function buscarCuadreActual(puestoId, repo) {
    const { data: todos } = await repo.readAll({ query: { fecha: hoy } })
    if (!Array.isArray(todos)) return null
    const delDia = todos
      .map(normalizarCuadre)
      .filter(n => n.puestoId === puestoId && n.fecha === hoy)
    if (delDia.length === 0) return null
    // Con varios cuadres del día (posibles duplicados), preferir el que siga
    // abierto y, entre varios, el creado más recientemente.
    const abiertos = delDia.filter(n => n.estado === 'abierto')
    const candidatos = abiertos.length ? abiertos : delDia
    candidatos.sort((a, b) => (Number(b.creadoEn) || 0) - (Number(a.creadoEn) || 0))
    return candidatos[0]
  }

  async function cargarLineasDeCuadre(cuadreId, repo, autoPopulate = true) {
    let itemsFiltrados
    if (conexion.modo.value !== 'online') {
      const itemsLocal = await db.getItemsDeCuadre(cuadreId)
      itemsFiltrados = itemsLocal.map(normalizarLinea)
    } else {
      const { data: items } = await repo.readAll({ query: { cuadreId } })
      if (!Array.isArray(items)) {
        lineas.value = []
        return
      }
      itemsFiltrados = items.filter((i) => {
        const n = normalizarLinea(i)
        return n.cuadreId === cuadreId
      })
    }
    if (itemsFiltrados.length > 0) {
    // Coalescer duplicados de productId (las líneas deben ser únicas por
    // producto; duplicados históricos corrompen el guardado al cerrar).
      const mapa = new Map()
      for (const l of itemsFiltrados.map(normalizarLinea)) {
        const prev = mapa.get(l.productoId)
        if (!prev) {
          mapa.set(l.productoId, { ...l })
          continue
        }
        prev.cantidad = (Number(prev.cantidad) || 0) + (Number(l.cantidad) || 0)
        prev.subtotal = Math.round(((Number(prev.subtotal) || 0) + (Number(l.subtotal) || 0)) * 100) / 100
        prev.esExtra = prev.esExtra || l.esExtra
        if (l.tipoLinea !== 'normal' && prev.tipoLinea === 'normal') prev.tipoLinea = l.tipoLinea
        if (!prev.nota) prev.nota = l.nota
      }
      // Fusionar productos activados después (solo agregan, nunca borran).
      if (autoPopulate) {
        for (const prod of productosActivos.value) {
          if (!mapa.has(prod.id)) {
            mapa.set(prod.id, {
              id: generateId(),
              cuadreId,
              productoId: prod.id,
              precioVentaUsado: prod.precioVentaActual,
              cantidad: 0,
              subtotal: 0,
              tipoLinea: 'normal',
              nota: null,
              esExtra: false
            })
          }
        }
      }
      lineas.value = [...mapa.values()]
      // Orden de catálogo (los fusionados no quedan al final sueltos).
      const ordenDe = new Map(productosActivos.value.map(p => [p.id, Number(p.orden ?? 9999)]))
      lineas.value.sort((a, b) => (ordenDe.get(a.productoId) ?? 9999) - (ordenDe.get(b.productoId) ?? 9999))
    } else if (autoPopulate) {
      lineas.value = productosActivos.value.map(prod => ({
        id: generateId(),
        cuadreId,
        productoId: prod.id,
        precioVentaUsado: prod.precioVentaActual,
        cantidad: 0,
        subtotal: 0,
        tipoLinea: 'normal',
        nota: null,
        esExtra: false
      }))
    } else {
      lineas.value = []
    }
  }

  async function crearCuadreNuevo(puestoId, repo) {
    const nuevoId = generateId()
    // No enviamos jefeId ni puestoId: el override online (beforeCreate) los inyecta desde auth.usuario
    // En offline, useLocalRepo los añade automáticamente (ver crearRepoGenerico).
    const cuadreObj = {
      id: nuevoId,
      fecha: hoy,
      estado: 'abierto',
      totalEsperado: 0,
      totalRealCaja: null,
      montoTransferencia: 0,
      montoFiado: 0,
      montoCobradoFiado: 0,
      diferencia: null,
      trabajadorTurnoId: null,
      pagoTrabajador: null,
      notas: null,
      cerradoEn: null,
      reabiertoVeces: 0,
      ultimaReaperturaEn: null
    }
    const payload = Object.fromEntries(
      Object.entries(cuadreObj).filter(([, v]) => v !== undefined)
    )
    try {
      await repo.create(payload)
    } catch (err) {
      const status = err?.response?.status || err?.statusCode
      if (status === 409) {
        const existente = await buscarCuadreActual(puestoId, repo)
        if (existente) return existente
      }
      throw err
    }
    return cuadreObj
  }

  function recalcularSubtotal(linea) {
    linea.subtotal = calcularSubtotalLinea(linea.precioVentaUsado, linea.cantidad)
  }

  // Sincroniza las líneas en memoria con la BD (crear/actualizar/eliminar).
  // Lo usan tanto el cierre como el autoguardado del borrador.
  async function persistirLineas() {
    const { data: existentes } = await itemsRepo.readAll({ query: { cuadreId: cuadre.value.id } })
    const itemsExistentes = (existentes ?? []).filter((i) => {
      const n = normalizarLinea(i)
      return n.cuadreId === cuadre.value.id
    })

    const existentesMap = new Map(itemsExistentes.map(i => [i.productoId, i]))
    const lineasGuardadas = new Set()

    for (const linea of lineas.value) {
      const existente = existentesMap.get(linea.productoId)
      if (existente) {
        const cambia = Number(existente.cantidad) !== Number(linea.cantidad)
          || Number(existente.precioVentaUsado) !== Number(linea.precioVentaUsado)
          || existente.tipoLinea !== linea.tipoLinea
          || existente.nota !== linea.nota
          || existente.esExtra !== linea.esExtra
        if (cambia) {
          await itemsRepo.update(existente.id, {
            cantidad: linea.cantidad,
            precioVentaUsado: linea.precioVentaUsado,
            subtotal: linea.subtotal,
            tipoLinea: linea.tipoLinea,
            nota: linea.nota,
            esExtra: linea.esExtra
          })
        }
        lineasGuardadas.add(linea.productoId)
      } else {
        await itemsRepo.create({
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
    }

    for (const existente of itemsExistentes) {
      if (!lineasGuardadas.has(existente.productoId)) {
        await itemsRepo.remove(existente.id)
      }
    }
  }

  // Autoguardado del borrador: líneas + campos de cierre a la BD con debounce.
  // Así recargar la web o matar la APK ya no pierde el avance.
  const AUTOSAVE_MS = 1500
  let autosaveTimer = null
  let guardandoBorrador = false
  let suprimirAutosave = false

  function programarAutosave() {
    if (suprimirAutosave) return
    if (!cuadre.value || cuadre.value.estado !== 'abierto' || esTrabajador.value) return
    clearTimeout(autosaveTimer)
    autosaveTimer = setTimeout(() => {
      guardarBorrador().catch(err => console.error('autosave cuadre:', err))
    }, AUTOSAVE_MS)
  }

  async function guardarBorrador() {
    if (guardandoBorrador || !cuadre.value || cuadre.value.estado !== 'abierto' || esTrabajador.value) return
    guardandoBorrador = true
    try {
      const guardar = async () => {
        await persistirLineas()
        await cuadreRepo.update(cuadre.value.id, {
          totalRealCaja: totalRealCaja.value,
          montoTransferencia: montoTransferencia.value,
          montoRegalo: montoRegalo.value,
          montoDescuento: montoDescuento.value,
          trabajadorTurnoId: trabajadorTurnoId.value,
          pagoTrabajador: pagoTrabajador.value,
          notas: notasCuadre.value
        })
      }
      // Igual que el cierre: transacción en local, directo en online.
      if (conexion.modo.value !== 'online') {
        await db.transaction(guardar)
      } else {
        await guardar()
      }
    } finally {
      guardandoBorrador = false
    }
  }

  // Cualquier edición del borrador (líneas o cierre) programa autoguardado.
  watch([lineas, totalRealCaja, montoTransferencia, pagoTrabajador, notasCuadre, trabajadorTurnoId],
    () => programarAutosave(), { deep: true })

  function toggleExpandir(lineaId) {
    if (expandida.has(lineaId)) {
      expandida.delete(lineaId)
    } else {
      expandida.add(lineaId)
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
        totalEsperado: totalEsperado.value,
        totalRealCaja: totalRealCaja.value,
        montoTransferencia: montoTransferencia.value,
        montoFiado: montoFiado.value,
        montoCobradoFiado: montoCobradoFiado.value,
        montoRegalo: montoRegalo.value,
        montoDescuento: montoDescuento.value,
        diferencia: diff,
        trabajadorTurnoId: trabajadorTurnoId.value,
        pagoTrabajador: pagoTrabajador.value,
        notas: notasCuadre.value,
        cerradoEn: new Date()
      }

      // En modo local se envuelve en transacción para no dejar el cuadre
      // en estado inconsistente si falla algún item a mitad del guardado.
      const persistir = async () => {
        await cuadreRepo.update(cuadre.value.id, cambios)
        cuadre.value = { ...cuadre.value, ...cambios }
        await persistirLineas()
      }

      if (conexion.modo.value !== 'online') {
        await db.transaction(async () => {
          await persistir()
        })
      } else {
        await persistir()
      }

      let mensaje = 'Cuadre cerrado: '
      if (tipo === 'exacto') mensaje += 'todo correcto, caja exacta.'
      else if (tipo === 'sobrante') mensaje += `sobrante de ${fmtPrecio(diff)}.`
      else mensaje += `faltante de ${fmtPrecio(-diff)}.`

      // Solo se avisa si hay sobrante o faltante; el cierre exacto no necesita toast.
      if (tipo !== 'exacto') {
        toast.add({
          title: 'Cuadre cerrado',
          description: mensaje,
          color: tipo === 'sobrante' ? 'info' : 'error'
        })
      }
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
    const ultimaReaperturaEn = Date.now()
    const pagoReabierto = trabajadorTurnoId.value ? salarioCalculado.value : null
    await cuadreRepo.update(cuadre.value.id, {
      estado: 'abierto',
      reabiertoVeces,
      ultimaReaperturaEn: new Date(ultimaReaperturaEn).toISOString(),
      // Limpiar también en el registro: con autoguardado, lo que quede aquí
      // resucitaría como borrador al recargar (los acumulados de fiado, que
      // son actividad real, se conservan). Las transferencias y ajustes
      // registrados también son actividad real y se conservan en el cuadre.
      totalRealCaja: null,
      pagoTrabajador: pagoReabierto
    })
    cuadre.value = {
      ...cuadre.value,
      estado: 'abierto',
      reabiertoVeces,
      ultimaReaperturaEn
    }
    // Limpiar montos de cierre del cierre anterior: al volver a cerrar hay que
    // re-ingresarlos, evitando re-usar silenciosamente el dinero en caja viejo.
    // Los montos de transferencia, fiado, regalo y descuento se conservan porque
    // son actividad real (y con autoguardado siguen en el borrador).
    totalRealCaja.value = null
    if (trabajadorTurnoId.value) await cargarSalarioTrabajador(trabajadorTurnoId.value)
    pagoTrabajador.value = pagoReabierto
    toast.add({ title: 'Cuadre reabierto', description: 'Ahora puedes editarlo nuevamente.', color: 'info' })
  }

  async function procesarImportacionJSON(file) {
    try {
      const texto = await file.text()
      const datos = JSON.parse(texto)
      if (!Array.isArray(datos)) {
        toast.add({ title: 'Formato inválido', description: 'El archivo debe contener un array de líneas.', color: 'error' })
        return
      }

      let actualizadas = 0

      for (const item of datos) {
        if (!item.productoId) continue
        const index = lineas.value.findIndex(l => l.productoId === item.productoId)
        if (index === -1) continue
        const linea = lineas.value[index]
        if (item.cantidad != null) linea.cantidad = Number(item.cantidad)
        if (item.precioVentaUsado != null) linea.precioVentaUsado = Number(item.precioVentaUsado)
        recalcularSubtotal(linea)
        actualizadas++
      }

      if (actualizadas === 0) {
        toast.add({ title: 'Sin cambios', description: 'Ninguna línea coincidió con los productos del cuadre.', color: 'warning' })
      }
    } catch (err) {
      console.error('Error al importar JSON:', err)
      toast.add({ title: 'Error al importar', description: err.message, color: 'error' })
    }
  }

  function getProductoNombre(productoId) {
    return productosActivos.value.find(p => p.id === productoId)?.nombre || '—'
  }

  return {
    cuadre, lineas, productosActivos, cargando,
    expandida,
    totalRealCaja, montoTransferencia, montoFiado, montoCobradoFiado,
    montoRegalo, montoDescuento,
    trabajadorTurnoId, pagoTrabajador, notasCuadre,
    totalEsperado, faltanteReal, salarioCalculado, diferencia, tipoDiferencia, esTrabajador, tituloCuadre,
    cargarDatos, recalcularSubtotal,
    toggleExpandir, cerrarCuadre, reabrirCuadre,
    procesarImportacionJSON, getProductoNombre,
    hoy
  }
}
