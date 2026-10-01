import { getCurrentScope, onScopeDispose } from 'vue'
import { useDb } from '../server-offline/db/client'
import { TABLES } from '../../shared/tables'
import { generateId } from '~/utils/id'
import { calcularSubtotalLinea } from '../utils'

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

// Autoguardado del borrador: líneas + campos de cierre a la BD con debounce.
// Así recargar la web o matar la APK ya no pierde el avance.
// NOTA: es singleton a nivel módulo. useCuadre() se instancia en varios
// componentes a la vez (cuadre.vue, LineaTable.vue, CierreForm.vue) y si cada
// uno llevara su propio timer/watch habría guardados concurrentes que llaman
// beginTransaction sobre la misma conexión SQLite (error "Already in
// transaction"). Se registra un solo ctx y un solo watch independientemente
// del número de instancias.
// 800ms sigue agrupando mientras el jefe escribe seguido, pero a la vista se
// siente inmediato. Además flushAutosave() vuelca lo pendiente al perder el
// foco de un campo, para no esperar al debounce.
const AUTOSAVE_MS = 800
let autosaveTimer = null
let guardandoBorrador = false
let suprimirAutosave = false
let ctxAutosave = null
let detenerAutosave = null

// Motivo por el que el autoguardado no debe actuar, o null si puede guardar.
// Centralizado porque lo necesitan tanto programarAutosave como
// guardarCuadreBorrador, y antes esas guardas estaban duplicadas en línea.
function motivoBloqueo(ctx) {
  if (!ctx) return 'sin contexto'
  if (!ctx.cuadre?.value) return 'sin cuadre en memoria'
  if (ctx.cuadre.value.estado !== 'abierto') return 'cuadre no abierto: ' + ctx.cuadre.value.estado
  if (ctx.esTrabajador?.value) return 'es trabajador'
  return null
}

function programarAutosave() {
  if (suprimirAutosave) return
  if (motivoBloqueo(ctxAutosave)) return

  clearTimeout(autosaveTimer)
  autosaveTimer = setTimeout(() => {
    autosaveTimer = null
    guardarCuadreBorrador().catch(reportarFalloAutosave)
  }, AUTOSAVE_MS)
}

// Los fallos del autoguardado antes morían en un console.error, invisible en
// la APK: se perdían ventas sin que nadie se enterara. Ahora sale un toast con
// el mensaje real del error, que es lo único que permite diagnosticar un fallo
// de escritura en el dispositivo.
function reportarFalloAutosave(err) {
  console.error('autosave cuadre:', err)
  const mensaje = err?.message ?? 'Inténtalo de nuevo.'
  ctxAutosave?.toast?.add({
    title: 'No se pudo guardar el cuadre',
    description: mensaje,
    color: 'error'
  })
}

async function guardarCuadreBorrador() {
  if (guardandoBorrador) return
  if (motivoBloqueo(ctxAutosave)) return

  const {
    cuadre, db, conexion, persistirLineas, cuadreRepo,
    totalRealCaja, montoTransferencia, montoRegalo, montoDescuento,
    trabajadorTurnoId, pagoTrabajador, notasCuadre
  } = ctxAutosave
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

function registrarAutosave(ctx) {
  // Falla ruidosa en desarrollo: si una fuente observada llega como undefined,
  // Vue no da ningún aviso y el autoguardado queda mudo en silencio, que es
  // justo la clase de fallo que costó horas de depuración.
  if (import.meta.dev) {
    for (const clave of ['lineas', 'totalRealCaja', 'pagoTrabajador', 'notasCuadre', 'trabajadorTurnoId']) {
      if (ctx[clave] === undefined) {
        console.warn(`[autosave] ctx.${clave} es undefined: esa fuente no disparará el guardado`)
      }
    }
  }
  ctxAutosave = ctx
  // Re-registrar en cada montaje, no solo la primera vez. Un watch creado
  // dentro de un componente muere con él: al navegar a otra vista y volver,
  // el watcher anterior ya fue destruido por Vue, pero la bandera decía
  // "registrado" y no se re-creaba, dejando el autoguardado mudo (las
  // cantidades escritas tras la segunda visita no se guardaban).
  if (detenerAutosave) detenerAutosave()
  const parar = watch(
    [
      ctx.lineas,
      ctx.totalRealCaja,
      ctx.montoTransferencia,
      ctx.montoFiado,
      ctx.montoCobradoFiado,
      ctx.pagoTrabajador,
      ctx.notasCuadre,
      ctx.trabajadorTurnoId
    ],
    () => programarAutosave(),
    { deep: true }
  )
  detenerAutosave = parar
  // Limpia al desmontar el componente que lo creó, para no dejar un watch
  // colgando apuntando a un ctx de una vista que ya no existe.
  if (getCurrentScope()) {
    onScopeDispose(() => {
      parar()
    })
  }
}

// Vuelca de inmediato lo que hubiera pendiente en el debounce. Se usa al
// perder el foco de un campo y al mandar la app a segundo plano, donde
// esperar el temporizador implicaría perder el cambio.
function flushAutosave() {
  if (!autosaveTimer) return
  clearTimeout(autosaveTimer)
  autosaveTimer = null
  guardarCuadreBorrador().catch(reportarFalloAutosave)
}

// Al mandar la app a segundo plano (o cerrar la pestaña) se guarda de
// inmediato lo pendiente: sin esto, el debounce se pierde y las últimas
// cantidades escritas se van con el proceso. Se registra una sola vez a
// nivel módulo y consulta el ctx vivo, igual que el watcher.
let segundoPlanoRegistrado = false

function registrarGuardadoEnSegundoPlano() {
  if (segundoPlanoRegistrado) return
  segundoPlanoRegistrado = true
  if (typeof document === 'undefined') return
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushAutosave()
  })
  window.addEventListener('pagehide', () => {
    flushAutosave()
  })
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

  // El pago al trabajador sigue al cálculo (base + 1% de lo vendido) mientras
  // el jefe no lo edite a mano. Solo memoria: se deduce del valor guardado
  // (ver cargarDatos), así que no necesita persistirse ni migración.
  const pagoManual = ref(false)

  const hoy = hoyLocal()

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

  // Elegir trabajador: cambia la base y reinicia el pago al cálculo. Si ya
  // había una cifra manual, el nuevo trabajador parte del cálculo de su
  // base (elegir a otra persona reinicia el monto, no arrastra el anterior).
  watch(trabajadorTurnoId, async (nuevoId, anterior) => {
    await cargarSalarioTrabajador(nuevoId)
    if (nuevoId) {
      if (anterior) pagoManual.value = false
      if (pagoTrabajador.value == null || !pagoManual.value) {
        pagoTrabajador.value = salarioCalculado.value
      }
    } else {
      pagoTrabajador.value = null
      pagoManual.value = false
    }
  })

  // Mientras el pago sea automático, se recalcula con cada venta: el bono
  // depende del total esperado, así que escribir 10 panes lo actualiza.
  // No hay bucle: pagoTrabajador no entra en salarioCalculado.
  watch(salarioCalculado, (nuevoSalario) => {
    if (!trabajadorTurnoId.value) return
    if (pagoManual.value) return
    if (nuevoSalario == null) return
    pagoTrabajador.value = nuevoSalario
  })

  // Marca el pago como manual en cuanto el jefe lo toca.
  function marcarPagoManual() {
    if (!pagoManual.value) pagoManual.value = true
  }

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

      // El trabajador y su base se restauran ANTES del pago: sin la base no
      // se puede saber si el valor guardado era el automático o uno editado a
      // mano, y la comparación decide si el campo sigue al cálculo.
      if (c.trabajadorTurnoId != null) {
        trabajadorTurnoId.value = c.trabajadorTurnoId
        await cargarSalarioTrabajador(c.trabajadorTurnoId)
      }

      // Los montos de cierre solo se restauran en cuadres cerrados (histórico).
      // Los montos de cierre se restauran siempre del registro: con el
      // autoguardado son el borrador actual (reabrir limpia el registro,
      // así que no resucita dinero viejo).
      if (c.totalRealCaja != null) totalRealCaja.value = Number(c.totalRealCaja)
      else totalRealCaja.value = null
      if (c.montoTransferencia != null) montoTransferencia.value = Number(c.montoTransferencia)
      else montoTransferencia.value = 0
      if (c.pagoTrabajador != null) {
        const guardado = Number(c.pagoTrabajador)
        pagoTrabajador.value = guardado
        // Coincide con el cálculo → fue automático y sigue trackeando.
        // Difiere → el jefe lo editó, se respeta su cifra.
        pagoManual.value = Math.abs(guardado - salarioCalculado.value) >= 0.005
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
    } catch (err) {
      toast.add({ title: 'Error', description: err.message || 'No se pudo cargar el cuadre.', color: 'error' })
    } finally {
      cargando.value = false
      // Las líneas con nota se muestran expandidas al entrar al cuadre.
      expandirConNotas()
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
      // usuariosRepo es un useRepo: devuelve { data, error }, no el registro.
      // Sin desestructurar, user.salario era siempre undefined y el ?? 600
      // aplicaba la base por defecto a cualquier trabajador.
      const { data: user } = await usuariosRepo.read(usuarioId)
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
      // Coalescer por ID de línea, no por producto: un mismo producto puede
      // tener varias líneas el mismo día (misma venta partida, p. ej. pan a 10
      // por la mañana y a 12 por la tarde). Solo se suman las líneas que
      // comparten id, que es la corrupción histórica que había que reparar.
      const porId = new Map()
      for (const l of itemsFiltrados.map(normalizarLinea)) {
        const prev = porId.get(l.id)
        if (!prev) {
          porId.set(l.id, { ...l })
          continue
        }
        prev.cantidad = (Number(prev.cantidad) || 0) + (Number(l.cantidad) || 0)
        prev.subtotal = Math.round(((Number(prev.subtotal) || 0) + (Number(l.subtotal) || 0)) * 100) / 100
      }
      const lineasCargadas = [...porId.values()]

      // Catálogo: un producto aparece si no tiene NINGUNA línea todavía. Se
      // comprueba por producto (no por clave de mapa) para no añadir otra
      // línea a un producto que ya tiene original y duplicadas.
      if (autoPopulate) {
        const conLinea = new Set(lineasCargadas.map(l => l.productoId))
        for (const prod of productosActivos.value) {
          if (conLinea.has(prod.id)) continue
          lineasCargadas.push({
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
      lineas.value = lineasCargadas
      // Orden de catálogo; las duplicadas (esExtra) quedan justo detrás de
      // su original, de modo que se leen juntas.
      const ordenDe = new Map(productosActivos.value.map(p => [p.id, Number(p.orden ?? 9999)]))
      lineas.value.sort((a, b) => {
        const pa = ordenDe.get(a.productoId) ?? 9999
        const pb = ordenDe.get(b.productoId) ?? 9999
        if (pa !== pb) return pa - pb
        if (a.esExtra !== b.esExtra) return a.esExtra ? 1 : -1
        return 0
      })
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

    // Clave por ID de línea (no por producto): un producto puede tener varias
    // líneas el mismo día con precios distintos, y cada una se crea/actualiza
    // por separado. Clave por producto haría que la duplicada sobrescribiera a
    // la original y que el borrado final se llevara por delante una de las dos.
    const existentesMap = new Map(itemsExistentes.map(i => [i.id, i]))
    const lineasGuardadas = new Set()

    for (const linea of lineas.value) {
      const existente = existentesMap.get(linea.id)
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
        lineasGuardadas.add(linea.id)
      } else {
        // El id se envía explícito: la línea ya nació en memoria (id generado
        // al duplicar o al auto-añadir el producto) y el autoguardado la
        // reconoce en la siguiente pasada en vez de duplicarla.
        await itemsRepo.create({
          id: linea.id,
          cuadreId: linea.cuadreId,
          productoId: linea.productoId,
          precioVentaUsado: linea.precioVentaUsado,
          cantidad: linea.cantidad,
          subtotal: linea.subtotal,
          tipoLinea: linea.tipoLinea,
          nota: linea.nota,
          esExtra: linea.esExtra
        })
        lineasGuardadas.add(linea.id)
      }
    }

    for (const existente of itemsExistentes) {
      if (!lineasGuardadas.has(existente.id)) {
        await itemsRepo.remove(existente.id)
      }
    }
  }

  // Autoguardado del borrador: el estado y el watch viven a nivel módulo
  // (singleton) aunque useCuadre() se instancie en varios componentes.
  // `lineas` TIENE que estar aquí: es la fuente que dispara el guardado de
  // cantidades y precios. Sin ella, ctx.lineas era undefined, Vue observaba
  // una fuente inexistente sin avisar y teclear cantidades no programaba
  // ningún guardado (el total se veía bien porque es un computed en memoria,
  // pero al recargar todo volvía a 0). Los montos de fiado también se
  // persisten en guardarCuadreBorrador, así que se observan igual.
  registrarAutosave({
    cuadre, lineas, esTrabajador, db, conexion, persistirLineas, cuadreRepo,
    totalRealCaja, montoTransferencia, montoRegalo, montoDescuento,
    montoFiado, montoCobradoFiado,
    trabajadorTurnoId, pagoTrabajador, notasCuadre, toast
  })
  registrarGuardadoEnSegundoPlano()

  function toggleExpandir(lineaId) {
    if (expandida.has(lineaId)) {
      expandida.delete(lineaId)
    } else {
      expandida.add(lineaId)
    }
  }

  // Añade una segunda línea del mismo producto para cuando el precio cambió a
  // mitad del día. Nace con el precio ACTUAL del catálogo (no copia el de la
  // línea original: justo lo que se necesita cambiar es ese) y cantidad 0.
  // Va marcada esExtra, que es la bandera que el esquema ya tenía prevista.
  function duplicarLinea(linea) {
    const prod = productosActivos.value.find(p => p.id === linea.productoId)
    const nueva = {
      id: generateId(),
      cuadreId: linea.cuadreId,
      productoId: linea.productoId,
      precioVentaUsado: prod ? Number(prod.precioVentaActual) : Number(linea.precioVentaUsado),
      cantidad: 0,
      subtotal: 0,
      tipoLinea: 'normal',
      nota: null,
      esExtra: true
    }
    const idx = lineas.value.findIndex(l => l.id === linea.id)
    lineas.value.splice(idx + 1, 0, nueva)
    expandida.add(nueva.id)
    return nueva
  }

  // Solo las duplicadas se pueden quitar: la línea del catálogo representa la
  // venta original del día y no puede desaparecer.
  function eliminarLinea(lineaId) {
    const idx = lineas.value.findIndex(l => l.id === lineaId)
    if (idx === -1) return
    if (!lineas.value[idx].esExtra) return
    lineas.value.splice(idx, 1)
    expandida.delete(lineaId)
  }

  // Al cargar el cuadre, deja visibles las líneas con nota: si el jefe dejó
  // una nota ayer y vuelve hoy, tiene que enterarse sin desplegar a ciegas.
  function expandirConNotas() {
    for (const l of lineas.value) {
      if (l.nota != null && String(l.nota).trim() !== '') {
        expandida.add(l.id)
      }
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
    duplicarLinea, eliminarLinea, expandirConNotas,
    procesarImportacionJSON, getProductoNombre,
    marcarPagoManual, flushAutosave,
    hoy
  }
}
