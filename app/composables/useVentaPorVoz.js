/**
 * useVentaPorVoz — Flujo completo de venta por voz para una ubicación.
 *
 * Dueño de: STT → interpretación → ubicación → catálogo → match de producto →
 * prefill. NO recibe `filas` ni estado de la página: carga su propio catálogo
 * con `useInventario().cargarSaldos()`, que devuelve ambas ubicaciones por fila
 * (lo mismo que usa useVistaInventario). Así el mismo composable sirve en
 * /quiosco, /almacen y, más adelante, en el dock global.
 *
 * La voz nunca registra: expone `producto` + `prefill` y la página abre su
 * DialogoVenta. Quien confirma es la persona.
 */
import { computed, nextTick, ref, watch } from 'vue'
import { Capacitor } from '@capacitor/core'
import { useAuth } from './useAuth'
import { useVozLexico } from './useVozLexico'
import { useCuentasFiado } from './useCuentasFiado'
import {
  UMBRAL_PRODUCTO,
  decidirProducto,
  elegirAlternativa,
  interpretar,
  resolverUbicacion,
  normalizar
} from '#shared/voz/gramatica'

import { voiceCommandSchema } from '#shared/schemas/voiceCommand'

import { calcularMotivoNoDisponible } from '../utils/voice/disponibilidad'
import { registrarEventoVoz } from '../utils/vozEventos'
import { clientesSimilares } from '#shared/clientes'
import { crearEmparejador } from '../utils/voice/emparejarCatalogo'
import { formatearStock, formatearPrecio, describirDestino } from '../utils/voice/respuestasVoz'
import { fraseVenta, fraseStockInsuficiente, FRASE_CONFIRMAR, FRASE_AYUDA, FRASE_NADA_QUE_REPETIR } from '../utils/voice/frasesVoz'
import { resolverVenta as resolverVentaPura } from '../utils/voice/resolverVenta'
import { proyectarStock } from '../utils/voice/pendientes'
import { ajustarCantidadVoz } from '../utils/voice/prefill'
import { useConfirmacionVoz } from './useConfirmacionVoz'
import { useVozDisparo } from './useVozDisparo'
import { evaluarDisparoVoz, esRutaInventario, ubicacionActiva } from '../utils/voice/disparoVoz'
import { vistaDeRuta } from '#shared/permisos'

const MODO_POR_TIPO = {
  directa: 'venta',
  casa: 'casa',
  familiar: 'familiar',
  regalo: 'regalo'
}

function esNativo() {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

function _create(ubicacion) {
  const inv = useInventario()
  const acciones = useAccionesPendientes()
  const voice = useVoiceCommand()
  const tts = useTts()
  const auth = useAuth()
  const fiado = useCuentasFiado()
  const perms = usePermisos()
  const conexion = useModoConexion()
  const { hayRed } = useSync()
  const vozLexico = useVozLexico()
  const confirmacion = useConfirmacionVoz()
  const disparo = useVozDisparo()
  const toast = useToast()
  const route = useRoute()

  // Máquina de estados del flujo de voz:
  //
  //   idle ──venderPorVoz──▶ preparando ──▶ escuchando ──▶ interpretando
  //     ▲                                                    │
  //     │                                                    ├─ ambiguo    (diálogo de candidatos)
  //     │                                                    ├─ listo      (prefill + DialogoVenta)
  //     │                                                    └─ confirmando (venta directa) ─▶ registrando ─▶ listo
  //     └────────────────────────────── error ◀──────────────┘
  //
  // `cancelarEscucha()` / `limpiar()` vuelven a `idle`. `confirmando` y
  // `registrando` solo existen en la venta directa por voz; `ocupado` los
  // incluye para que el dock no quede habilitado mientras se confirma.
  const estado = ref('idle')
  const candidatos = ref([])
  const prefill = ref(null)
  const producto = ref(null)
  const modo = ref('venta')
  /**
   * Última respuesta hablada de una consulta. «Repite» la vuelve a decir; no
   * guarda ventas ni la confirmación, para no repetir una venta por error.
   */
  const ultimaRespuestaVoz = ref('')
  // Promesa del TTS de lectura (read-back).
  const readBackPromise = ref(null)
  /** Texto EXACTO que se habló. La confirmación lo usa como prompt anti-eco. */
  const readBackTexto = ref('')
  // El layout la activa solo para jefe: el anuncio incluye "Diga sí para confirmar"
  const confirmacionHablada = ref(false)
  const readBackIncluyeConfirmacion = ref(false)
  const showCandidatos = ref(false)
  const pendiente = ref(null)
  const ultimoError = ref(null)
  // Cada comando tiene una generación: cancelar o reiniciar invalida la
  // anterior para que una promesa tardía no reabra el diálogo.
  let generacion = 0
  let errorTimer = null

  // No decidir con el fail-open de `puede()` ni con el `modo` por defecto:
  // hasta que permisos y modo cargan, el micrófono ni se muestra.
  const configLista = computed(() => perms.cargado.value && conexion.cargado.value)
  const tienePermiso = computed(() => configLista.value && perms.puedeAccion(ubicacion, 'voz'))
  // En web se muestra si el navegador soporta Web Speech API (Chrome/Edge en
  // contexto seguro). En Android nativo se mantiene el plugin nativo.
  const micVisible = computed(() => tienePermiso.value && (esNativo() || voice.disponible.value))
  const motivoNoDisponible = computed(() =>
    calcularMotivoNoDisponible({
      configLista: configLista.value,
      tienePermiso: perms.puedeAccion(ubicacion, 'voz'),
      esNativo: esNativo(),
      webSoportado: voice.esWebSoportado.value,
      nativoDisponible: esNativo() ? voice.nativoDisponible.value : null,
      permisoMicrofono: esNativo() ? voice.permisoMicrofono.value : null,
      modo: conexion.modo.value,
      hayRed: hayRed.value,
      motor: voice.preferenciaMotor.value
    })
  )

  // En Android, consulta la disponibilidad real del STT una vez cargada la
  // configuración, para no mostrar el micrófono donde no existe.
  watch(
    configLista,
    (ready) => {
      if (ready && esNativo() && voice.nativoDisponible.value == null) {
        void voice.check()
      }
    },
    { immediate: true }
  )

  const disponible = computed(() => tienePermiso.value && !motivoNoDisponible.value)
  const transcriptParcial = computed(() => voice.transcriptParcial.value)
  const ocupado = computed(() =>
    estado.value === 'preparando'
    || estado.value === 'escuchando'
    || estado.value === 'interpretando'
    || estado.value === 'confirmando'
    || estado.value === 'registrando'
  )

  function limpiar() {
    // Si había una espera de confirmación en curso, abortarla: el flujo cambió.
    confirmacion.cancelar()
    if (errorTimer) {
      clearTimeout(errorTimer)
      errorTimer = null
    }
    candidatos.value = []
    showCandidatos.value = false
    pendiente.value = null
    prefill.value = null
    producto.value = null
    readBackPromise.value = null
    readBackIncluyeConfirmacion.value = false
    modo.value = 'venta'
    ultimoError.value = null
    estado.value = 'idle'
  }

  /** Tras un error, el aviso se retira solo para no tapar la pantalla. */
  function programarLimpiezaError() {
    if (errorTimer) clearTimeout(errorTimer)
    errorTimer = setTimeout(() => {
      errorTimer = null
      if (estado.value === 'error') limpiar()
    }, 8000)
  }

  function prepararVenta(fila, slots, ubicacionVenta) {
    const modoVenta = MODO_POR_TIPO[slots?.tipoVenta] || 'venta'
    const ubi = ubicacionVenta || ubicacion
    prefill.value = {
      modo: modoVenta,
      ubicacion: ubi,
      cantidad: Number(slots?.cantidad) || 1,
      tipoVenta: slots?.tipoVenta || 'directa',
      precioVentaUsado: slots?.precioUnitario == null ? null : Number(slots.precioUnitario),
      clienteHint: slots?.clienteHint || null,
      clienteId: slots?.clienteId || null
    }
    modo.value = modoVenta
    producto.value = fila
    estado.value = 'listo'
    voice.registrar('voz.listo', {
      producto: fila?.nombre || '',
      cantidad: prefill.value?.cantidad ?? null,
      ubicacion: ubi
    })

    // Read-back exacto del formulario (lo prellenado), no lo interpretado.
    // Se guarda la promesa para que la UI pueda esperarla antes de hablar
    // otra locución (la confirmación hablada va justo después).
    programarReadBack(fila)
  }

  /**
   * Habla la venta prellenada con su importe y, si toca, la petición de
   * confirmación. Se reutiliza al corregir la cantidad para leer la nueva.
   */
  function programarReadBack(fila) {
    const filaActual = fila ?? producto.value
    readBackPromise.value = (async () => {
      const nombre = filaActual?.nombre ?? producto.value?.nombre ?? 'producto'
      const cant = Math.trunc(Number(prefill.value?.cantidad) || 1)
      const lugar = prefill.value?.ubicacion === 'quiosco' ? 'quiosco' : 'almacén'
      if (!filaActual) return
      // El importe se lee SIEMPRE: es la única cifra que delata una cantidad mal
      // transcrita ("12 panes" oído como "2 panes").
      const precio = prefill.value?.precioVentaUsado == null
        ? Number(filaActual?.precioVentaActual ?? 0)
        : Number(prefill.value.precioVentaUsado)
      let texto = fraseVenta({ cantidad: cant, nombre, lugar, importe: precio * cant })
      // Una sola locución: anuncio + petición de confirmación, sin hueco entre ambas.
      readBackIncluyeConfirmacion.value = Boolean(confirmacionHablada.value) && modo.value === 'venta' && tts.habilitado.value
      if (readBackIncluyeConfirmacion.value) texto = `${texto} ${FRASE_CONFIRMAR}`
      // Se guarda lo que de verdad se dice: la espera de confirmación lo compara
      // con la transcripción para no confundir el eco del TTS con un «sí».
      readBackTexto.value = texto
      try {
        if (tts?.speak) await tts.speak(texto)
        else toast.add({ title: 'Voz (lectura)', description: texto, color: 'neutral', duration: 8000 })
      } catch {
        /* noop */
      }
    })()
  }

  /**
   * Corrige la cantidad durante la confirmación («no, eran tres»).
   *
   * Revalida el stock proyectado de la ubicación prellenada, actualiza la
   * cantidad y vuelve a leer la venta con el importe nuevo. No registra nada:
   * la confirmación sigue siendo del jefe.
   */
  async function cambiarCantidad(cantidad) {
    const filaActual = producto.value
    const actual = prefill.value
    const n = Math.trunc(Number(cantidad) || 0)
    if (!filaActual || !actual || n < 1) return { ok: false }
    const ubi = actual.ubicacion === 'quiosco' ? 'quiosco' : 'almacen'
    const disponible = Number(filaActual[ubi]) || 0
    const ajuste = ajustarCantidadVoz(n, disponible)
    const lugar = ubi === 'quiosco' ? 'quiosco' : 'almacén'
    if (ajuste.excede) {
      const mensaje = fraseStockInsuficiente({ disponible, nombre: filaActual.nombre, lugar })
      ultimoError.value = mensaje
      try {
        await tts.speak(mensaje)
      } catch {
        /* noop */
      }
      toast.add({ title: 'Voz', description: mensaje, color: 'warning', duration: 8000 })
      return { ok: false, motivo: 'stock', disponible }
    }
    const anterior = Math.trunc(Number(actual.cantidad) || 1)
    prefill.value = { ...actual, cantidad: n }
    voice.registrar('voz.corregir', { antes: anterior, despues: n })
    programarReadBack(filaActual)
    return { ok: true, cantidad: n }
  }

  /** Saldos de una ubicación. En quiosco se excluyen los productos no vendibles.
   *  Caché in-memory con TTL corto para no pegar a la API en cada comando.
   *  El mapa separa venta (`soloVendibles`) de stock (`soloVendibles: false`)
   *  para que una consulta no invalide el catálogo de la otra. */
  const CACHE_TTL_MS = 2 * 60 * 1000
  const cacheCatalogo = new Map()

  async function catalogoDe(ubi, { soloVendibles = true } = {}) {
    const pid = auth.usuarioActual.value?.puestoId ?? ''
    const clave = `${pid}:${conexion.modo.value}:${ubi}:${soloVendibles ? 'v' : 't'}`
    // Lo dictado y aún sin revisar ya está comprometido: el stock que ve la voz
    // (y el que puede venderse) es el real menos lo pendiente.
    await acciones.cargar().catch(() => {})
    const pendientes = acciones.pendientes.value
    const cached = cacheCatalogo.get(clave)
    // `versionSaldos` sube con cada venta/entrada hecha en otra pantalla: un
    // cache viejo ofrecería stock ya vendido.
    if (cached && cached.version === inv.versionSaldos.value && Date.now() - cached.ts < CACHE_TTL_MS) {
      return proyectarStock(cached.data, pendientes)
    }
    const filas = await inv.cargarSaldos() ?? []
    const data = (soloVendibles && ubi === 'quiosco')
      ? filas.filter(f => f.seVende !== false)
      : filas
    cacheCatalogo.set(clave, { ts: Date.now(), version: inv.versionSaldos.value, data })
    return proyectarStock(data, pendientes)
  }

  function invalidarCatalogoVoz() {
    cacheCatalogo.clear()
  }

  watch(() => conexion.modo.value, () => {
    cacheCatalogo.clear()
  })

  /**
   * Resuelve una venta SIN efectos: cliente, ubicación, catálogo y producto.
   * Devuelve una acción plana que `ejecutar()` aplica. La lógica de decisión
   * vive en `utils/voice/resolverVenta.js` (puro y testeable).
   */
  async function resolverVentaAccion(slots, sttConfidence = 0, vigente = () => true, opciones = {}) {
    // Match fuzzy de cliente (accent-insensible + similitud del shared).
    if (slots.clienteHint) {
      try {
        const pid = auth.usuarioActual.value?.puestoId
        if (pid) {
          const listaClientes = await fiado.cargarClientes(pid, { incluirSinCliente: false })
          const similares = clientesSimilares(slots.clienteHint, listaClientes, { umbral: 0.7 })
          if (similares.length) {
            slots.clienteId = similares[0].cliente.id
          }
        }
      } catch {
        // La selección de cliente no debe bloquear el dictado.
      }
    }

    // El catálogo depende de la ubicación destino; el conflicto se detecta sin
    // cargar nada (la acción 'aviso' no necesita catálogo). La revisión de lo
    // dictado con la app cerrada no tiene pantalla: no hay conflicto que valga.
    const permitirConflicto = opciones.permitirConflicto ?? esRutaInventario(route.path)
    const destino = resolverUbicacion(slots, ubicacion, { permitirConflicto })
    const catalogo = destino.conflicto ? [] : await catalogoDe(destino.ubicacion)
    if (!vigente()) return { tipo: 'cancelado' }

    const accion = resolverVentaPura({
      slots,
      catalogo,
      ubicacionVista: ubicacion,
      permitirConflicto,
      sttConfidence,
      // La app abierta nunca registra sin formulario; solo el buzón (app
      // cerrada) pide la resolución con `ventaDirecta: true` para calcular el
      // precio que luego se revisa.
      ventaDirecta: opciones.ventaDirecta ?? false
    })

    voice.registrar('voz.catalogo', {
      ubicacion: destino.ubicacion,
      total: catalogo.length,
      hint: slots?.productoHint || '',
      encontrados: accion.encontrados ?? 0
    })
    if (accion.tipo === 'venta' || accion.tipo === 'ambiguo' || accion.tipo === 'stock') {
      voice.registrar('voz.decision', {
        elegido: accion.fila?.nombre || '',
        ambiguo: accion.tipo === 'ambiguo',
        encontrados: accion.encontrados ?? 0,
        efectivo: accion.efectivo || 0
      })
    }
    return accion
  }

  async function manejarNavegacion(slots, vigente = () => true) {
    if (!vigente()) return
    const destino = describirDestino(slots.destino)
    if (!destino) throw new Error('No conozco esa pantalla.')
    if (!perms.puedeVista(slots.destino)) {
      estado.value = 'idle'
      toast.add({ title: 'Voz', description: `No tienes permiso para abrir ${destino.label}.`, color: 'warning' })
      return
    }
    if (vistaDeRuta(route.path) === slots.destino) {
      estado.value = 'idle'
      toast.add({ title: 'Voz', description: `Ya estás en ${destino.label}.`, color: 'neutral' })
      return
    }
    await navigateTo(destino.ruta)
    if (vigente()) estado.value = 'idle'
  }

  async function responderStock(fila, slots) {
    const result = formatearStock(fila, {
      ubicacionPedida: slots.ubicacion,
      verQuiosco: perms.puedeVista('quiosco'),
      verAlmacen: perms.puedeVista('almacen')
    })
    if (result.sinPermiso) {
      toast.add({ title: 'Voz', description: 'No tienes permiso para consultar ese inventario.', color: 'warning' })
      if (estado.value !== 'idle') estado.value = 'idle'
      return
    }
    ultimaRespuestaVoz.value = result.habla
    toast.add({ title: result.titulo, description: result.descripcion, color: 'success', duration: 8000 })
    try {
      await tts.speak(result.habla)
    } catch {
      /* noop */
    }
    estado.value = 'idle'
  }

  /** Precio vigente + stock («cuánto cuesta el pan»). */
  async function responderPrecio(fila, slots) {
    const result = formatearPrecio(fila, {
      ubicacionPedida: slots.ubicacion,
      verQuiosco: perms.puedeVista('quiosco'),
      verAlmacen: perms.puedeVista('almacen')
    })
    if (result.sinPermiso) {
      toast.add({ title: 'Voz', description: 'No tienes permiso para consultar ese inventario.', color: 'warning' })
      if (estado.value !== 'idle') estado.value = 'idle'
      return
    }
    ultimaRespuestaVoz.value = result.habla
    toast.add({ title: result.titulo, description: result.descripcion, color: 'success', duration: 8000 })
    try {
      await tts.speak(result.habla)
    } catch {
      /* noop */
    }
    estado.value = 'idle'
  }

  /** Repite la última respuesta hablada (consultas de stock o precio). */
  async function repetirUltimaRespuesta() {
    const texto = ultimaRespuestaVoz.value || FRASE_NADA_QUE_REPETIR
    try {
      await tts.speak(texto)
    } catch {
      /* noop */
    }
    if (estado.value !== 'idle') estado.value = 'idle'
  }

  /** Ayuda hablada: qué puede hacer el asistente. */
  async function responderAyuda() {
    toast.add({
      title: 'Voz',
      description: 'Vender, consultar stock y precios, y abrir pantallas.',
      color: 'success',
      duration: 8000
    })
    try {
      await tts.speak(FRASE_AYUDA)
    } catch {
      /* noop */
    }
    if (estado.value !== 'idle') estado.value = 'idle'
  }

  /**
   * Resuelve una consulta de stock o precio SIN efectos. El catálogo completo
   * (ambas ubicaciones, sin filtrar `seVende`) reutiliza la caché.
   */
  async function resolverConsultaProducto(comando, slots, sttConfidence = 0, vigente = () => true) {
    const catalogo = await catalogoDe('global', { soloVendibles: false })
    if (!vigente()) return { tipo: 'cancelado' }
    const emparejar = crearEmparejador(catalogo, sttConfidence)
    const encontrados = emparejar(slots.productoHint)
    if (!encontrados.length) {
      return {
        tipo: 'error',
        comando,
        motivo: 'producto_no_encontrado',
        mensaje: `No encontré "${slots.productoHint || 'ese producto'}" en el inventario.`,
        texto: slots?.productoHint || '',
        auditar: { comando, motivo: 'producto_no_encontrado', confianza: Number(sttConfidence) || 0 }
      }
    }
    const decision = decidirProducto(encontrados, { umbral: UMBRAL_PRODUCTO, sttConfidence })
    if (!decision.elegido) {
      return {
        tipo: 'ambiguo',
        comando,
        candidatos: encontrados,
        slots,
        sttConfidence
      }
    }
    return {
      tipo: comando === 'consulta_precio' ? 'consultar_precio' : 'consultar_stock',
      fila: decision.elegido.row,
      slots
    }
  }

  function resolverConsultaStock(slots, sttConfidence = 0, vigente = () => true) {
    return resolverConsultaProducto('consulta_stock', slots, sttConfidence, vigente)
  }

  function resolverConsultaPrecio(slots, sttConfidence = 0, vigente = () => true) {
    return resolverConsultaProducto('consulta_precio', slots, sttConfidence, vigente)
  }

  async function plantillaPara(texto) {
    const productos = new Set()
    const clientes = new Set()
    try {
      const filas = await catalogoDe('global', { soloVendibles: false })
      for (const f of filas) {
        for (const valor of [f.nombre, f.descripcion]) {
          if (!valor) continue
          for (const token of normalizar(valor).split(' ')) {
            if (token.length >= 3) productos.add(token)
          }
        }
      }
    } catch {
      /* noop */
    }
    try {
      const pid = auth.usuarioActual.value?.puestoId
      if (pid) {
        const lista = await fiado.cargarClientes(pid, { incluirSinCliente: true }) ?? []
        for (const c of lista) {
          if (!c?.nombre) continue
          for (const token of normalizar(c.nombre).split(' ')) {
            if (token.length >= 3) clientes.add(token)
          }
        }
      }
    } catch {
      /* noop */
    }
    if (!productos.size && !clientes.size) return null
    try {
      const { enmascarar } = await import('#shared/voz/privacidad.js')
      return enmascarar(texto, { palabrasProducto: productos, palabrasCliente: clientes })
    } catch {
      return null
    }
  }

  /**
   * N-best: elige la transcripción que mejor resuelve contra el catálogo.
   * Solo lee; no cambia estado, no habla y no navega.
   */
  async function elegirTexto(texto, sttConfidence, alternativas) {
    let textoElegido = texto
    // El plugin puede mandar hasta 5 alternativas; solo las 3 mejores justifican
    // el coste de emparejar el catálogo con cada una. N-best ya se evalúa con
    // la transcripción base y las dos primeras alternativas suelen cubrir el
    // caso real; el resto son ruido.
    const listaTextos = [texto, ...(Array.isArray(alternativas)
      ? alternativas.slice(0, 3).map(a => a?.texto ?? a?.text ?? a)
      : [])]
      .map(t => String(t ?? '')).map(t => t.trim()).filter(Boolean)
    const unicos = Array.from(new Set(listaTextos.map(t => normalizar(t)))).map(n => listaTextos.find(t => normalizar(t) === n))
    if (unicos.length <= 1) return textoElegido

    const items = []
    // Un emparejador por catálogo: las alternativas suelen resolver el mismo
    // catálogo y el fuzzy es el trabajo pesado del N-best.
    const emparejadores = new Map()
    const emparejarPara = (cat) => {
      if (!emparejadores.has(cat)) emparejadores.set(cat, crearEmparejador(cat, sttConfidence))
      return emparejadores.get(cat)
    }
    for (const t of unicos) {
      const clas = interpretar(t, vozLexico.lexico.value)
      const rec = { indice: items.length, comando: clas.comando, elegido: false, ambiguo: true, efectivo: 0, encontrados: 0 }
      if (clas.comando === 'navegacion') {
        rec.elegido = true
      } else if (clas.comando === 'venta_directa' || clas.comando === 'consulta_stock' || clas.comando === 'consulta_precio') {
        try {
          const destinoUbi = (clas.slots?.ubicacion) || ubicacion
          const cat = clas.comando === 'consulta_stock' || clas.comando === 'consulta_precio'
            ? await catalogoDe('global', { soloVendibles: false })
            : await catalogoDe(destinoUbi)
          const encontrados = emparejarPara(cat)(clas.slots?.productoHint || '')
          const decision = decidirProducto(encontrados, { umbral: UMBRAL_PRODUCTO, sttConfidence })
          rec.elegido = !!decision.elegido
          rec.ambiguo = !decision.elegido && encontrados.length > 0
          rec.efectivo = decision.efectivo || 0
          rec.encontrados = encontrados.length
        } catch {
          // Una alternativa ilegible no invalida el N-best.
        }
      }
      items.push(rec)
    }
    const idx = elegirAlternativa(items)
    textoElegido = unicos[idx] ?? unicos[0]
    voice.registrar('voz.nbest', {
      base: texto,
      elegido: textoElegido,
      candidatos: unicos.length
    })
    return textoElegido
  }

  /**
   * Convierte un texto dictado en una ACCIÓN. Sin efectos: no habla, no navega,
   * no abre diálogos ni escribe. `ejecutar()` aplica la acción.
   *
   * Esto es lo que permite reutilizar el mismo intérprete con la app cerrada
   * (dry-run) y con la app abierta (ejecución tras confirmación).
   */
  async function resolver(texto, { sttConfidence = 0, alternativas = [], vigente = () => true, ventaDirecta = null, permitirConflicto = null } = {}) {
    const textoElegido = await elegirTexto(texto, sttConfidence, alternativas)
    const interpretado = interpretar(textoElegido, vozLexico.lexico.value)
    voice.registrar('voz.interpretar', {
      texto: textoElegido,
      comando: interpretado?.comando || '',
      motivo: interpretado?.reasons?.[0] || '',
      confianza: Number(interpretado?.confidence) || 0
    })
    const validacion = voiceCommandSchema.safeParse(interpretado)
    if (!validacion.success) {
      return { tipo: 'error', mensaje: 'No te entendí. Prueba: "vende 5 panes".', texto: textoElegido }
    }

    const { comando, slots } = validacion.data
    if (comando === 'desconocido') {
      const motivo = interpretado?.reasons?.[0] || 'sin_comando'
      return {
        tipo: 'error',
        motivo,
        mensaje: 'Todavía no sé hacer eso. Prueba: "vende 5 panes".',
        texto: textoElegido,
        auditar: motivo !== 'sin_texto'
          ? { comando: 'desconocido', motivo, confianza: Number(interpretado?.confidence) || 0 }
          : null
      }
    }

    if (comando === 'navegacion') return { tipo: 'navegacion', slots }
    if (comando === 'consulta_stock') return resolverConsultaStock(slots, sttConfidence, vigente)
    if (comando === 'consulta_precio') return resolverConsultaPrecio(slots, sttConfidence, vigente)
    if (comando === 'repetir') return { tipo: 'repetir' }
    if (comando === 'ayuda') return { tipo: 'ayuda' }
    // venta_directa
    return resolverVentaAccion(slots, sttConfidence, vigente, { ventaDirecta, permitirConflicto })
  }

  /** Aplica una acción del resolver. Único sitio con efectos del flujo. */
  async function ejecutar(accion, { gen = null } = {}) {
    if (!accion || accion.tipo === 'cancelado') return
    const vigente = () => gen == null || gen === generacion
    if (!vigente()) return

    if (accion.auditar) {
      const auditoria = accion.auditar
      void (async () => {
        const plantilla = await plantillaPara(accion.texto || '')
        await registrarEventoVoz({
          comando: auditoria.comando,
          motivo: auditoria.motivo,
          confianza: auditoria.confianza,
          plantilla
        })
      })()
    } else if (accion.comando && accion.motivo) {
      // Errores de resolución (producto no encontrado). Se audita igual que
      // antes, ahora desde un único sitio.
      void (async () => {
        const plantilla = await plantillaPara(accion.texto || '')
        await registrarEventoVoz({
          comando: accion.comando,
          motivo: accion.motivo,
          confianza: Number(accion.sttConfidence) || 0,
          plantilla
        })
      })()
    }

    switch (accion.tipo) {
      case 'error':
        throw new Error(accion.mensaje)
      case 'aviso':
        estado.value = 'idle'
        toast.add({ title: 'Voz', description: accion.mensaje, color: 'warning' })
        return
      case 'ambiguo':
        pendiente.value = {
          comando: accion.comando || 'venta_directa',
          slots: accion.slots,
          sttConfidence: accion.sttConfidence
        }
        candidatos.value = accion.candidatos
        showCandidatos.value = true
        estado.value = 'ambiguo'
        return
      case 'stock':
        try {
          await tts.speak(accion.mensaje)
        } catch {
          /* noop */
        }
        throw new Error(accion.mensaje)
      case 'navegacion':
        return manejarNavegacion(accion.slots, vigente)
      case 'consultar_stock':
        return responderStock(accion.fila, accion.slots)
      case 'consultar_precio':
        return responderPrecio(accion.fila, accion.slots)
      case 'repetir':
        return repetirUltimaRespuesta()
      case 'ayuda':
        return responderAyuda()
      case 'venta':
        // Siempre el formulario; la confirmación hablada la maneja el layout.
        return prepararVenta(accion.fila, accion.slots, accion.destino.ubicacion)
      default:
        return
    }
  }

  /**
   * Envoltorio del flujo existente: resolver + ejecutar.
   * @param {number|null} gen Generación que inició el comando; si deja de ser
   *   la actual (cancelación o nuevo dictado), no se toca el estado.
   */
  async function procesar(texto, sttConfidence = 0, gen = null, alternativas = []) {
    const vigente = () => gen == null || gen === generacion
    candidatos.value = []
    showCandidatos.value = false
    pendiente.value = null
    prefill.value = null
    producto.value = null
    estado.value = 'interpretando'
    const accion = await resolver(texto, { sttConfidence, alternativas, vigente })
    return ejecutar(accion, { gen })
  }

  async function venderPorVoz() {
    if (!disponible.value) {
      if (motivoNoDisponible.value) {
        toast.add({ title: 'Voz', description: motivoNoDisponible.value, color: 'warning' })
      }
      return
    }
    // El STT es singleton: si ya hay una escucha en curso, no abrir otra.
    if (voice.estado.value === 'listening') return

    limpiar()
    const gen = ++generacion
    if (tts.greetingEnabled?.value) {
      estado.value = 'preparando'
      try {
        await tts.speak('Hola, ¿qué puedo hacer por ti hoy?')
      } catch {
        /* noop */
      }
      if (gen !== generacion) return
    }
    estado.value = 'preparando'
    try {
      // Deja pintar "Preparando…" antes de que el micrófono tome el foco
      // (en el primer uso Android muestra el diálogo de permiso).
      await nextTick()
      if (gen !== generacion) return
      estado.value = 'escuchando'

      // Idioma fijo de la app (español/Cuba): lo define useVoiceCommand.
      voice.registrar('stt.ui.dock', {
        modo: conexion.modo.value,
        red: voice.hayInternet.value
      })
      // El motor, el idioma y si va online/offline los decide useVoiceCommand
      // según Ajustes y la conexión real.
      await voice.startListening({
        contexto: { modo: conexion.modo.value, red: voice.hayInternet.value }
      })
      if (gen !== generacion) return
      if (voice.estado.value === 'cancelled' || voice.estado.value === 'idle') {
        estado.value = 'idle'
        return
      }
      if (voice.estado.value === 'error') throw new Error(voice.error.value || 'No te entendí.')
      const texto = voice.transcript.value?.trim() || voice.transcriptParcial.value?.trim()
      if (!texto) throw new Error('No te entendí. Prueba otra vez.')
      await procesar(texto, voice.confidence.value, gen, voice.alternativas.value)
    } catch (e) {
      if (gen !== generacion) return
      const mensaje = e?.message || 'Error de voz.'
      voice.registrar('voz.error', { mensaje, code: voice.codigoError.value })
      ultimoError.value = mensaje
      estado.value = 'error'
      toast.add({ title: 'Voz', description: mensaje, color: 'error' })
      programarLimpiezaError()
    }
  }

  /** Detiene el micrófono y descarta cualquier resultado pendiente. */
  async function cancelarEscucha() {
    generacion++
    if (errorTimer) {
      clearTimeout(errorTimer)
      errorTimer = null
    }
    try {
      await voice.stopListening()
    } catch {
      // Si ya terminó, no hay nada que detener.
    }
    limpiar()
  }

  /** Detiene la escucha para enviar el resultado actual (push-to-talk). */
  async function detenerEscucha() {
    if (estado.value !== 'escuchando' && estado.value !== 'preparando') return
    try {
      await voice.stopListening(false)
    } catch {
      // Si el motor ya terminó, no hay nada que enviar.
    }
  }

  function reintentar() {
    return venderPorVoz()
  }

  async function seleccionarCandidato(candidato) {
    const datos = pendiente.value
    showCandidatos.value = false
    pendiente.value = null
    if (!candidato?.row || !datos) return
    if (datos.comando === 'consulta_stock') {
      await responderStock(candidato.row, datos.slots)
      return
    }
    if (datos.comando === 'consulta_precio') {
      await responderPrecio(candidato.row, datos.slots)
      return
    }
    prepararVenta(candidato.row, datos.slots, datos.slots?.ubicacion || undefined)
  }

  const tituloCandidatos = computed(() => {
    const comando = pendiente.value?.comando
    if (comando === 'consulta_stock') return 'Confirma qué producto consultar'
    if (comando === 'consulta_precio') return 'Confirma de qué producto quieres el precio'
    return 'Confirma el producto'
  })

  function cancelar() {
    return cancelarEscucha()
  }

  /** Solo dev: ejercita el pipeline sin micrófono (input "simular voz"). */
  async function simular(texto) {
    if (!import.meta.dev) return
    limpiar()
    try {
      await procesar(texto, 0.95)
    } catch (e) {
      const mensaje = e?.message || 'Error.'
      ultimoError.value = mensaje
      estado.value = 'error'
      toast.add({ title: 'Voz (simulada)', description: mensaje, color: 'error' })
      programarLimpiezaError()
    }
  }

  // Auto-disparo por widget/atajo/deeplink. En nativo lo emite
  // `plugins/deeplink.client.js` a través de `useVozDisparo`: un contador que
  // sube en CADA toque (antes se deduplicaba por `route.fullPath` y el segundo
  // toque en la misma pantalla no hacía nada). Solo lo consume la instancia de
  // la ubicación objetivo; si no, quiosco y almacén abrirían el micrófono a la
  // vez (dos reconocedores / "busy" en Android).
  let disparoConsumido = 0
  watch(
    [() => disparo.seq.value, () => route.path, configLista, disponible, motivoNoDisponible],
    ([seq, ruta, lista, listo, motivo]) => {
      if (seq === disparoConsumido) return
      const objetivo = disparo.ruta.value || ruta
      // Un disparo viejo (p. ej. la navegación fue bloqueada) no debe sonar
      // minutos después.
      if (Date.now() - disparo.ts.value > 15000) {
        disparoConsumido = seq
        return
      }
      if (ubicacionActiva(objetivo) !== ubicacion) return
      const evaluacion = evaluarDisparoVoz({
        query: '1',
        configLista: lista,
        ubicacionActual: ubicacionActiva(objetivo),
        ubicacionInstancia: ubicacion,
        consumido: null,
        disponible: listo,
        motivo,
        clave: String(seq)
      })
      if (evaluacion.accion === 'none' || evaluacion.accion === 'esperar') return
      disparoConsumido = seq
      if (evaluacion.accion === 'motivo') {
        if (evaluacion.mensaje) {
          toast.add({ title: 'Voz', description: evaluacion.mensaje, color: 'warning' })
        }
        return
      }
      if (evaluacion.accion === 'disparar') void venderPorVoz()
    },
    { immediate: true }
  )

  // En web no hay deeplink: se mantiene `?voice=1` (dev y navegador).
  let consumidoWeb = null
  watch(
    [() => route.query.voice, () => route.path, configLista, disponible, motivoNoDisponible],
    ([consulta, ruta, lista, listo, motivo]) => {
      if (esNativo()) return
      const evaluacion = evaluarDisparoVoz({
        query: consulta,
        configLista: lista,
        ubicacionActual: ubicacionActiva(ruta),
        ubicacionInstancia: ubicacion,
        consumido: consumidoWeb,
        disponible: listo,
        motivo,
        clave: route.fullPath
      })
      if (evaluacion.accion === 'none' || evaluacion.accion === 'esperar') return
      if (evaluacion.consumir && evaluacion.clave) consumidoWeb = evaluacion.clave
      if (evaluacion.accion === 'motivo') {
        if (evaluacion.mensaje) {
          toast.add({ title: 'Voz', description: evaluacion.mensaje, color: 'warning' })
        }
        return
      }
      if (evaluacion.accion === 'disparar') void venderPorVoz()
    },
    { immediate: true }
  )

  return {
    estado,
    ocupado,
    disponible,
    micVisible,
    motivoNoDisponible,
    ultimoError,
    transcriptParcial,
    candidatos,
    showCandidatos,
    prefill,
    producto,
    modo,
    readBackPromise,
    readBackTexto,
    confirmacionHablada,
    readBackIncluyeConfirmacion,
    cambiarCantidad,
    venderPorVoz,
    resolver,
    ejecutar,
    reintentar,
    detenerEscucha,
    cancelarEscucha,
    invalidarCatalogoVoz,
    seleccionarCandidato,
    cancelar,
    limpiar,
    simular,
    tituloCandidatos
  }
}

/**
 * Una instancia por ubicación.
 *
 * El layout crea quiosco y almacén: una instancia por ubicación evita dos
 * flujos distintos con estado de catálogo y prefill desincronizado.
 *
 * `ssr: false`: no hay estado compartido entre peticiones.
 */
const instancias = new Map()

export function useVentaPorVoz(ubicacion) {
  if (ubicacion !== 'quiosco' && ubicacion !== 'almacen') {
    throw new Error(`useVentaPorVoz: ubicación no válida (${ubicacion})`)
  }
  if (!instancias.has(ubicacion)) instancias.set(ubicacion, _create(ubicacion))
  return instancias.get(ubicacion)
}
