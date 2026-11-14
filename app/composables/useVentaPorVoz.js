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
import { Preferences } from '@capacitor/preferences'
import { useAuth } from './useAuth'
import { useVozLexico } from './useVozLexico'
import { useCuentasFiado } from './useCuentasFiado'
import {
  UMBRAL_PRODUCTO,
  decidirProducto,
  interpretar,
  preferirHintConTipo,
  resolverUbicacion,
  normalizar
} from '#shared/voz/gramatica'

import { voiceCommandSchema } from '#shared/schemas/voiceCommand'

import { calcularMotivoNoDisponible } from '../utils/voice/disponibilidad'
import { registrarEventoVoz } from '../utils/vozEventos'
import { registrarProof } from '../utils/voice/proofs'
import { clientesSimilares } from '#shared/clientes'
import { crearEmparejador } from '../utils/voice/emparejarCatalogo'
import { formatearStock, describirDestino } from '../utils/voice/respuestasVoz'
import { fraseVenta, fraseStockInsuficiente, FRASE_CONFIRMAR, describirCantidad } from '../utils/voice/frasesVoz'
import { esNegacion } from '../utils/voice/confirmacion'
import { useConfirmacionVoz } from './useConfirmacionVoz'
import { evaluarDisparoVoz, esRutaInventario, ubicacionActiva } from '../utils/voice/disparoVoz'
import { vistaDeRuta } from '#shared/permisos'

const MODO_POR_TIPO = {
  directa: 'venta',
  casa: 'casa',
  familiar: 'familiar',
  regalo: 'regalo'
}

// Ventana para deshacer la venta directa diciendo "cancela".
const CANCELA_MS = 5000

function esNativo() {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

function _create(ubicacion) {
  const inv = useInventario()
  const voice = useVoiceCommand()
  const tts = useTts()
  const auth = useAuth()
  const fiado = useCuentasFiado()
  const perms = usePermisos()
  const conexion = useModoConexion()
  const { hayRed } = useSync()
  const vozLexico = useVozLexico()
  const zeroTouch = useVoiceZeroTouch()
  const confirmacion = useConfirmacionVoz()
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
  // Promesa del TTS de lectura (read-back).
  const readBackPromise = ref(null)
  // El layout lo activa con el Modo PRO: el anuncio incluye "Diga sí para confirmar"
  const confirmacionHablada = ref(false)
  const readBackIncluyeConfirmacion = ref(false)
  const showCandidatos = ref(false)
  const pendiente = ref(null)
  const ultimoError = ref(null)
  // Voz directa: salta el DialogoVenta y registra tras confirmación hablada.
  const ventaDirectaVoz = ref(false)
  // Venta pendiente de ventana "cancela" (undo por voz durante X segundos).
  const ventaParaCancela = ref(null)

  // Persistencia de ventaDirectaVoz en Preferences (compartida entre instancias).
  const PREF_VDV = 'voz.ventaDirectaVoz'
  async function cargarPreferenciaVDV() {
    try {
      const { value } = await Preferences.get({ key: PREF_VDV })
      ventaDirectaVoz.value = value === 'true'
    } catch {}
  }
  watch(ventaDirectaVoz, async (val) => {
    try {
      await Preferences.set({ key: PREF_VDV, value: String(val) })
    } catch {}
  })
  void cargarPreferenciaVDV()

  // Cada comando tiene una generación: cancelar o reiniciar invalida la
  // anterior para que una promesa tardía no reabra el diálogo.
  let generacion = 0
  let errorTimer = null

  // Se marca por ruta completa, no con un booleano de instancia: el segundo
  // `?voice=1` (otra navegación) vuelve a disparar; el mismo, no.
  let consumido = null

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
    ventaParaCancela.value = null
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
    // otra locución (Modo PRO pide confirmación justo después).
    readBackPromise.value = (async () => {
      const nombre = fila?.nombre ?? producto.value?.nombre ?? 'producto'
      const cant = Math.trunc(Number(prefill.value?.cantidad) || 1)
      const lugar = prefill.value?.ubicacion === 'quiosco' ? 'quiosco' : 'almacén'
      if (!fila) return
      let texto = fraseVenta({ cantidad: cant, nombre, lugar })
      // Una sola locución: anuncio + petición de confirmación, sin hueco entre ambas.
      readBackIncluyeConfirmacion.value = Boolean(confirmacionHablada.value) && modoVenta === 'venta'
      if (readBackIncluyeConfirmacion.value) texto = `${texto} ${FRASE_CONFIRMAR}`
      try {
        if (tts?.speak) await tts.speak(texto)
        else toast.add({ title: 'Voz (lectura)', description: texto, color: 'neutral', duration: 8000 })
      } catch {
        /* noop */
      }
    })()
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
    const cached = cacheCatalogo.get(clave)
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return cached.data
    }
    const filas = await inv.cargarSaldos() ?? []
    const data = (soloVendibles && ubi === 'quiosco')
      ? filas.filter(f => f.seVende !== false)
      : filas
    cacheCatalogo.set(clave, { ts: Date.now(), data })
    return data
  }

  function invalidarCatalogoVoz() {
    cacheCatalogo.clear()
  }

  watch(() => conexion.modo.value, () => {
    cacheCatalogo.clear()
  })

  /**
   * @param {string} texto
   * @param {number} sttConfidence
   * @param {number|null} gen Generación que inició el comando; si deja de ser
   *   la actual (cancelación o nuevo dictado), no se toca el estado.
   */
  async function procesarVenta(slots, sttConfidence = 0, vigente = () => true) {
    estado.value = 'interpretando'
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

    // Sin ubicación explícita se usa la de la vista/instancia (no almacén a
    // ciegas). Fuera de inventario no hay conflicto: si se dijo una ubicación,
    // se respeta y el formulario la muestra antes de confirmar.
    const destino = resolverUbicacion(slots, ubicacion, {
      permitirConflicto: esRutaInventario(route.path)
    })
    if (destino.conflicto) {
      if (!vigente()) return
      estado.value = 'idle'
      const nombre = destino.ubicacion === 'almacen' ? 'Almacén' : 'Quiosco'
      toast.add({
        title: 'Voz',
        description: `Eso es una venta de ${nombre}. Ábrela desde ${nombre} para confirmarla.`,
        color: 'warning'
      })
      return
    }

    const catalogo = await catalogoDe(destino.ubicacion)
    if (!vigente()) return

    const emparejar = crearEmparejador(catalogo, sttConfidence)

    let encontrados = emparejar(slots.productoHint)

    // "vende un refresco familiar": ¿"familiar" es el tipo de venta o parte del
    // nombre? Si existe un producto con ese nombre exacto, gana el producto.
    if (slots.alternativaTipo) {
      const alterna = emparejar(slots.alternativaTipo.productoHint)
      if (preferirHintConTipo(alterna)) {
        encontrados = alterna
        slots.productoHint = slots.alternativaTipo.productoHint
        slots.tipoVenta = slots.alternativaTipo.tipoVenta
      }
    }

    voice.registrar('voz.catalogo', {
      ubicacion: destino.ubicacion,
      total: catalogo.length,
      hint: slots?.productoHint || '',
      encontrados: encontrados.length
    })

    if (!encontrados.length) {
      void (async () => {
        const plantilla = await plantillaPara(slots?.productoHint || '')
        await registrarEventoVoz({
          comando: 'venta_directa',
          motivo: 'producto_no_encontrado',
          confianza: Number(sttConfidence) || 0,
          plantilla
        })
      })()
      throw new Error(`No encontré "${slots.productoHint || 'ese producto'}".`)
    }

    const decision = decidirProducto(encontrados, { umbral: UMBRAL_PRODUCTO, sttConfidence })
    voice.registrar('voz.decision', {
      elegido: decision.elegido?.row?.nombre || '',
      ambiguo: !decision.elegido && encontrados.length > 0,
      encontrados: encontrados.length,
      efectivo: decision.efectivo || 0
    })
    if (!decision.elegido) {
      pendiente.value = { comando: 'venta_directa', slots, sttConfidence }
      candidatos.value = encontrados
      showCandidatos.value = true
      estado.value = 'ambiguo'
      return
    }

    const filaElegida = decision.elegido.row
    const ubiLabel = destino.ubicacion === 'quiosco' ? 'quiosco' : 'almacén'
    const maxDisp = Number(filaElegida?.[destino.ubicacion] ?? 0)
    const cantidadSolicitada = Math.max(1, Math.trunc(Number(slots?.cantidad) || 1))
    if (cantidadSolicitada > maxDisp) {
      void (async () => {
        const plantilla = await plantillaPara(slots?.productoHint || '')
        await registrarEventoVoz({
          comando: 'venta_directa',
          motivo: 'stock_insuficiente',
          confianza: Number(sttConfidence) || 0,
          plantilla
        })
      })()
      try {
        await tts.speak(fraseStockInsuficiente({ disponible: maxDisp, nombre: filaElegida?.nombre, lugar: ubiLabel }))
      } catch {
        /* noop */
      }
      throw new Error(fraseStockInsuficiente({ disponible: maxDisp, nombre: filaElegida?.nombre, lugar: ubiLabel }))
    }

    // Voz directa: salta el DialogoVenta y confirma por voz.
    if (ventaDirectaVoz.value && slots.tipoVenta === 'directa') {
      return venderVozDirecta(slots, sttConfidence, vigente, filaElegida, destino)
    }

    prepararVenta(filaElegida, slots, destino.ubicacion)
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
    toast.add({ title: result.titulo, description: result.descripcion, color: 'success', duration: 8000 })
    try {
      await tts.speak(result.habla)
    } catch {
      /* noop */
    }
    estado.value = 'idle'
  }

  async function manejarConsultaStock(slots, sttConfidence = 0, vigente = () => true) {
    if (!vigente()) return
    // El stock se consulta sobre el catálogo completo (ambas ubicaciones), sin
    // filtrar `seVende`, y reutiliza la caché para no repetir cargarSaldos().
    const catalogo = await catalogoDe('global', { soloVendibles: false })
    const emparejar = crearEmparejador(catalogo, sttConfidence)
    const encontrados = emparejar(slots.productoHint)
    if (!encontrados.length) {
      void (async () => {
        const plantilla = await plantillaPara(slots?.productoHint || '')
        await registrarEventoVoz({
          comando: 'consulta_stock',
          motivo: 'producto_no_encontrado',
          confianza: Number(sttConfidence) || 0,
          plantilla
        })
      })()
      throw new Error(`No encontré "${slots.productoHint || 'ese producto'}" en el inventario.`)
    }
    const decision = decidirProducto(encontrados, { umbral: UMBRAL_PRODUCTO, sttConfidence })
    if (!decision.elegido) {
      pendiente.value = { comando: 'consulta_stock', slots, sttConfidence }
      candidatos.value = encontrados
      showCandidatos.value = true
      estado.value = 'ambiguo'
      return
    }
    await responderStock(decision.elegido.row, slots)
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

  async function procesar(texto, sttConfidence = 0, gen = null, alternativas = []) {
    const vigente = () => gen == null || gen === generacion
    // N-best: si hay alternativas, elegir la mejor antes de procesar.
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
    if (unicos.length > 1) {
      const { interpretar } = await import('#shared/voz/gramatica')
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
        let rec = { indice: items.length, comando: clas.comando, elegido: false, ambiguo: true, efectivo: 0, encontrados: 0 }
        if (clas.comando === 'navegacion') {
          rec.elegido = true
        } else if (clas.comando === 'venta_directa' || clas.comando === 'consulta_stock') {
          try {
            const destinoUbi = (clas.slots?.ubicacion) || ubicacion
            const cat = clas.comando === 'consulta_stock'
              ? await catalogoDe('global', { soloVendibles: false })
              : await catalogoDe(destinoUbi)
            const encontrados = emparejarPara(cat)(clas.slots?.productoHint || '')
            const decision = decidirProducto(encontrados, { umbral: UMBRAL_PRODUCTO, sttConfidence })
            rec.elegido = !!decision.elegido
            rec.ambiguo = !decision.elegido && encontrados.length > 0
            rec.efectivo = decision.efectivo || 0
            rec.encontrados = encontrados.length
          } catch {
            // ignore
          }
        }
        items.push(rec)
      }
      // elegirAlternativa is sync; import
      const gram = await import('#shared/voz/gramatica')
      const idx = gram.elegirAlternativa(items)
      textoElegido = unicos[idx] ?? unicos[0]
      voice.registrar('voz.nbest', {
        base: texto,
        elegido: textoElegido,
        candidatos: unicos.length
      })
    }

    estado.value = 'interpretando'
    candidatos.value = []
    showCandidatos.value = false
    pendiente.value = null
    prefill.value = null
    producto.value = null

    const interpretado = interpretar(textoElegido, vozLexico.lexico.value)
    voice.registrar('voz.interpretar', {
      texto: textoElegido,
      comando: interpretado?.comando || '',
      motivo: interpretado?.reasons?.[0] || '',
      confianza: Number(interpretado?.confidence) || 0
    })
    const validacion = voiceCommandSchema.safeParse(interpretado)
    if (!validacion.success) throw new Error('No te entendí. Prueba: "vende 5 panes".')

    const { comando, slots } = validacion.data
    if (comando === 'desconocido') {
      const motivoDesconocido = interpretado?.reasons?.[0] || 'sin_comando'
      if (motivoDesconocido !== 'sin_texto') {
        void (async () => {
          const plantilla = await plantillaPara(textoElegido)
          await registrarEventoVoz({
            comando: 'desconocido',
            motivo: motivoDesconocido,
            confianza: Number(interpretado?.confidence) || 0,
            plantilla
          })
        })()
      }
      throw new Error('Todavía no sé hacer eso. Prueba: "vende 5 panes".')
    }

    if (comando === 'navegacion') return manejarNavegacion(slots, vigente)
    if (comando === 'consulta_stock') return manejarConsultaStock(slots, sttConfidence, vigente)
    // venta_directa
    return procesarVenta(slots, sttConfidence, vigente)
  }

  /**
   * Espera una respuesta hablada ("sí"/"no"/"cancela") durante `timeoutMs`.
   * Requiere que ya se haya abierto el micrófono con `voice.startListening()`.
   */
  async function esperarConfirmacionVoz(timeoutMs = 5000) {
    return confirmacion.esp({ timeoutMs })
  }

  /**
   * Venta directa por voz: salta el DialogoVenta.
   * Flujo: STT → match producto → TTS read-back → confirmación hablada "sí" →
   * registrarVentaDirecta → ventana de cancela (undo por voz durante X s).
   *
   * Si hay ambigüedad o stock insuficiente, cae al formulario normal.
   * Solo jefe (exigirJefe dentro de registrarVentaDirecta).
   */
  async function venderVozDirecta(slots, sttConfidence = 0, gen = null, filaResuelta = null, destinoResuelto = null) {
    const vigente = () => gen == null || gen === generacion
    if (!vigente()) return

    // 1. Ubicación (sin conflicto: si no se dijo, usa la de la vista actual).
    const destino = destinoResuelto || resolverUbicacion(slots, ubicacion, { permitirConflicto: false })
    if (destino.conflicto) {
      // No se sabe la ubicación: abrir formulario para que elija.
      return procesarVenta(slots, sttConfidence, vigente)
    }
    if (!vigente()) return

    // 2. Producto. Normalmente ya viene resuelto desde `procesarVenta` (evita
    // repetir el fuzzy y el chequeo de stock). Si se llama por otra vía, se
    // resuelve aquí.
    let filaElegida = filaResuelta
    if (!filaElegida) {
      const catalogo = await catalogoDe(destino.ubicacion)
      if (!vigente()) return

      const emparejar = crearEmparejador(catalogo, sttConfidence)
      let encontrados = emparejar(slots.productoHint)

      if (slots.alternativaTipo) {
        const alterna = emparejar(slots.alternativaTipo.productoHint)
        if (preferirHintConTipo(alterna)) {
          encontrados = alterna
          slots.productoHint = slots.alternativaTipo.productoHint
          slots.tipoVenta = slots.alternativaTipo.tipoVenta
        }
      }

      if (!encontrados.length) {
        void (async () => {
          await registrarEventoVoz({
            comando: 'venta_directa',
            motivo: 'producto_no_encontrado',
            confianza: Number(sttConfidence) || 0
          })
        })()
        throw new Error(`No encontré "${slots.productoHint || 'ese producto'}".`)
      }

      const decision = decidirProducto(encontrados, { umbral: UMBRAL_PRODUCTO, sttConfidence })
      if (!decision.elegido) {
        pendiente.value = { comando: 'venta_directa', slots, sttConfidence }
        candidatos.value = encontrados
        showCandidatos.value = true
        estado.value = 'ambiguo'
        return
      }
      filaElegida = decision.elegido.row
    }

    const ubiLabel = destino.ubicacion === 'quiosco' ? 'quiosco' : 'almacén'
    const maxDisp = Number(filaElegida?.[destino.ubicacion] ?? 0)
    const cantidadSolicitada = Math.max(1, Math.trunc(Number(slots?.cantidad) || 1))

    // Auditoría central (misma tabla que el Modo PRO). Sin esto, las ventas
    // directas por voz no aparecían en `/admin/voz-confirmaciones`.
    const registrarPrueba = (outcome) => {
      void registrarProof({
        comando: 'venta_directa',
        productoId: filaElegida?.productoId ?? filaElegida?.id ?? null,
        productoNombre: filaElegida?.nombre ?? null,
        cantidad: cantidadSolicitada,
        ubicacion: destino.ubicacion,
        modo: 'venta',
        confianza: Number(sttConfidence) || 0,
        outcome
      }, { token: auth.jwtSync.value })
    }

    if (cantidadSolicitada > maxDisp) {
      void (async () => {
        await registrarEventoVoz({
          comando: 'venta_directa',
          motivo: 'stock_insuficiente',
          confianza: Number(sttConfidence) || 0
        })
      })()
      try {
        await tts.speak(fraseStockInsuficiente({ disponible: maxDisp, nombre: filaElegida?.nombre, lugar: ubiLabel }))
      } catch {}
      throw new Error(fraseStockInsuficiente({ disponible: maxDisp, nombre: filaElegida?.nombre, lugar: ubiLabel }))
    }

    // 3. TTS read-back + confirmación hablada.
    const precioUnitario = Number(filaElegida?.precioVentaActual ?? 0)
    const importe = Math.trunc(precioUnitario * cantidadSolicitada)
    const textoReadBack
      = `Voy a vender ${describirCantidad(cantidadSolicitada, filaElegida.nombre)} del ${ubiLabel}, ${importe} pesos. ${FRASE_CONFIRMAR}`

    estado.value = 'confirmando'
    try {
      await tts.speak(textoReadBack)
    } catch {}
    if (!vigente()) return

    // 4. Escuchar "sí" / "no". Hay que abrir el micrófono: la escucha del
    // comando ya terminó y `voice.transcript` aún tiene la frase anterior.
    voice.reset()
    const escuchaConfirmacion = voice.startListening({
      contexto: { modo: conexion.modo.value, red: voice.hayInternet.value }
    }).catch(() => {})
    const resultado = await esperarConfirmacionVoz(zeroTouch.timeoutMs.value)
    try {
      await voice.stopListening()
    } catch {}
    await escuchaConfirmacion
    if (!vigente()) return

    if (resultado === 'negado') {
      registrarPrueba('cancelado')
      estado.value = 'idle'
      try {
        await tts.speak('Cancelado.')
      } catch {}
      return
    }
    if (resultado !== 'afirmado') {
      // Sin respuesta: se abre el formulario, como promete la locución.
      registrarPrueba('abandonado')
      try {
        await tts.speak('Sin respuesta, se abre el formulario.')
      } catch {}
      prepararVenta(filaElegida, slots, destino.ubicacion)
      return
    }

    // 5. Registrar venta directa (sin formulario).
    if (!vigente()) return
    estado.value = 'registrando'
    const lineas = [{
      productoId: filaElegida.productoId ?? filaElegida.id,
      cantidad: cantidadSolicitada,
      precioVentaUsado: precioUnitario,
      secuencia: 0,
      loteId: null // FIFO lo selecciona en construirVentaDirecta
    }]

    let resultadoVenta
    try {
      resultadoVenta = await inv.registrarVentaDirecta({
        ubicacion: destino.ubicacion,
        tipoVenta: slots.tipoVenta || 'directa',
        clienteId: slots.clienteId || null,
        lineas
      })
    } catch (e) {
      estado.value = 'error'
      ultimoError.value = e?.message || 'Error al registrar la venta.'
      toast.add({ title: 'Voz', description: ultimoError.value, color: 'error' })
      programarLimpiezaError()
      return
    }

    // 6. Auditoría de voz.
    void (async () => {
      await registrarEventoVoz({
        comando: 'venta_directa',
        motivo: 'ok',
        confianza: Number(sttConfidence) || 0
      })
    })()
    registrarPrueba('auto-confirmado')

    // 7. TTS de confirmación.
    try {
      await tts.speak(`Venta registrada. ${cantidadSolicitada} ${filaElegida.nombre}.`)
    } catch {}

    // 8. Ventana de cancela: escuchar "cancela" durante 5 segundos para deshacer.
    ventaParaCancela.value = { id: resultadoVenta.id, producto: filaElegida.nombre, cantidad: cantidadSolicitada }
    estado.value = 'listo'
    toast.add({
      title: 'Venta registrada',
      description: `Di "cancela" para deshacer (${CANCELA_MS / 1000} s).`,
      color: 'warning',
      duration: 6000
    })

    const cancelaMs = CANCELA_MS
    let cancelaTimer = null
    let cancelaWatcher = null
    const terminarCancela = async () => {
      if (cancelaTimer) clearTimeout(cancelaTimer)
      if (cancelaWatcher) cancelaWatcher()
      try {
        await voice.stopListening()
      } catch {
        /* noop */
      }
      ventaParaCancela.value = null
      estado.value = 'idle'
    }
    cancelaTimer = setTimeout(() => void terminarCancela(), cancelaMs)

    voice.startListening({
      contexto: { modo: conexion.modo.value, red: voice.hayInternet.value }
    }).catch(() => terminarCancela())

    cancelaWatcher = watch(
      [() => voice.transcript?.value, () => voice.transcriptParcial?.value],
      () => {
        const texto = String(voice.transcript?.value || voice.transcriptParcial?.value || '')
        if (esNegacion(texto) && ventaParaCancela.value) {
          terminarCancela()
          void anularVentaDirectaDesdeVoz(ventaParaCancela.value.id)
        }
      }
    )

    return resultadoVenta
  }

  async function anularVentaDirectaDesdeVoz(ventaId) {
    try {
      await inv.anularVentaDirecta(ventaId)
      estado.value = 'idle'
      try {
        await tts.speak('Venta anulada. Stock restaurado.')
      } catch {}
      toast.add({ title: 'Venta anulada', description: 'Se deshizo la última venta por voz.', color: 'warning' })
      void (async () => {
        await registrarEventoVoz({ comando: 'venta_anulada', motivo: 'cancela_voz', confianza: 0 })
      })()
    } catch (e) {
      estado.value = 'error'
      ultimoError.value = e?.message || 'No se pudo anular.'
      toast.add({ title: 'Voz', description: ultimoError.value, color: 'error' })
      programarLimpiezaError()
    }
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
    prepararVenta(candidato.row, datos.slots, datos.slots?.ubicacion || undefined)
  }

  const tituloCandidatos = computed(() =>
    pendiente.value?.comando === 'consulta_stock'
      ? 'Confirma qué producto consultar'
      : 'Confirma el producto'
  )

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

  // Auto-disparo por deeplink/widget: `?voice=1`. Se espera a que permisos y
  // modo carguen para no fallar por el default 'local'. Solo lo consume la
  // instancia de la ubicación visible: si no, quiosco y almacén abrían el
  // micrófono a la vez (dos reconocedores / "busy" en Android).
  watch(
    [() => route.query.voice, () => route.path, configLista, disponible, motivoNoDisponible],
    ([consulta, ruta, lista, listo, motivo]) => {
      const evaluacion = evaluarDisparoVoz({
        query: consulta,
        configLista: lista,
        ubicacionActual: ubicacionActiva(ruta),
        ubicacionInstancia: ubicacion,
        consumido,
        disponible: listo,
        motivo,
        clave: route.fullPath
      })
      if (evaluacion.accion === 'none' || evaluacion.accion === 'esperar') return
      if (evaluacion.consumir && evaluacion.clave) consumido = evaluacion.clave
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
    ventaDirectaVoz,
    ventaParaCancela,
    readBackPromise,
    confirmacionHablada,
    readBackIncluyeConfirmacion,
    venderPorVoz,
    venderVozDirecta,
    anularVentaDirectaDesdeVoz,
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
 * El layout crea quiosco y almacén, y Ajustes vuelve a pedir quiosco: sin
 * caché eran dos flujos (y dos `ventaDirectaVoz`) distintos, así que el
 * interruptor de Ajustes no se reflejaba en el dock hasta recargar.
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
