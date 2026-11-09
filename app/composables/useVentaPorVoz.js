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
import { useCuentasFiado } from './useCuentasFiado'
import {
  UMBRAL_PRODUCTO,
  combinarConfianza,
  decidirProducto,
  interpretar,
  preferirHintConTipo,
  resolverUbicacion
} from '#shared/voz/gramatica'
import { voiceCommandSchema } from '#shared/schemas/voiceCommand'
import { fuzzyMatchProducts } from '../utils/voice/fuzzyMatchProducts'
import { calcularMotivoNoDisponible } from '../utils/voice/disponibilidad'
import { clientesSimilares } from '#shared/clientes'
import { evaluarDisparoVoz, ubicacionActiva } from '../utils/voice/disparoVoz'

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

export function useVentaPorVoz(ubicacion) {
  if (ubicacion !== 'quiosco' && ubicacion !== 'almacen') {
    throw new Error(`useVentaPorVoz: ubicación no válida (${ubicacion})`)
  }

  const inv = useInventario()
  const voice = useVoiceCommand()
  const tts = useTts()
  const auth = useAuth()
  const fiado = useCuentasFiado()
  const perms = usePermisos()
  const conexion = useModoConexion()
  const { hayRed } = useSync()
  const toast = useToast()
  const route = useRoute()

  // idle | preparando | escuchando | interpretando | ambiguo | listo | error
  const estado = ref('idle')
  const candidatos = ref([])
  const prefill = ref(null)
  const producto = ref(null)
  const modo = ref('venta')
  const showCandidatos = ref(false)
  const pendiente = ref(null)
  const ultimoError = ref(null)

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
      hayRed: hayRed.value
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
  )

  function limpiar() {
    if (errorTimer) {
      clearTimeout(errorTimer)
      errorTimer = null
    }
    candidatos.value = []
    showCandidatos.value = false
    pendiente.value = null
    prefill.value = null
    producto.value = null
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

  function prepararVenta(fila, slots) {
    const modoVenta = MODO_POR_TIPO[slots?.tipoVenta] || 'venta'
    prefill.value = {
      modo: modoVenta,
      cantidad: Number(slots?.cantidad) || 1,
      tipoVenta: slots?.tipoVenta || 'directa',
      precioVentaUsado: slots?.precioUnitario == null ? null : Number(slots.precioUnitario),
      clienteHint: slots?.clienteHint || null,
      clienteId: slots?.clienteId || null
    }
    modo.value = modoVenta
    producto.value = fila
    estado.value = 'listo'
  }

  /** Saldos de una ubicación. En quiosco se excluyen los productos no vendibles.
   *  Caché in-memory con TTL corto para no pegar a la API en cada comando. */
  const CACHE_TTL_MS = 2 * 60 * 1000
  const cacheCatalogo = ref(null)

  async function catalogoDe(ubi) {
    const pid = auth.usuarioActual.value?.puestoId ?? ''
    const clave = `${pid}:${conexion.modo.value}:${ubi}`
    const cached = cacheCatalogo.value
    if (cached && cached.clave === clave && Date.now() - cached.ts < CACHE_TTL_MS) {
      return cached.data
    }
    const filas = await inv.cargarSaldos() ?? []
    const data = ubi === 'quiosco' ? filas.filter(f => f.seVende !== false) : filas
    cacheCatalogo.value = { clave, ts: Date.now(), data }
    return data
  }

  function invalidarCatalogoVoz() {
    cacheCatalogo.value = null
  }

  watch(() => conexion.modo.value, () => {
    cacheCatalogo.value = null
  })

  /**
   * @param {string} texto
   * @param {number} sttConfidence
   * @param {number|null} gen Generación que inició el comando; si deja de ser
   *   la actual (cancelación o nuevo dictado), no se toca el estado.
   */
  async function procesar(texto, sttConfidence = 0, gen = null) {
    const vigente = () => gen == null || gen === generacion
    estado.value = 'interpretando'
    candidatos.value = []
    showCandidatos.value = false
    pendiente.value = null
    prefill.value = null
    producto.value = null

    const validacion = voiceCommandSchema.safeParse(interpretar(texto))
    if (!validacion.success) throw new Error('No te entendí. Prueba: "vende 5 panes".')

    const { comando, slots } = validacion.data
    if (comando === 'desconocido') {
      throw new Error('Todavía no sé hacer eso. Prueba: "vende 5 panes".')
    }

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

    const destino = resolverUbicacion(slots, ubicacion)
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

    const base = catalogo.map(f => ({
      id: f.productoId,
      name: f.nombre,
      canonicalSpeak: f.nombre,
      description: f.descripcion
    }))
    const emparejar = hint => fuzzyMatchProducts(hint, base)
      .map((c) => {
        const row = catalogo.find(f => f.productoId === c.product.id)
        return row ? { ...c, row, scoreEfectivo: combinarConfianza(c.score, sttConfidence) } : null
      })
      .filter(Boolean)

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

    if (!encontrados.length) {
      throw new Error(`No encontré "${slots.productoHint || 'ese producto'}".`)
    }

    const decision = decidirProducto(encontrados, { umbral: UMBRAL_PRODUCTO, sttConfidence })
    if (!decision.elegido) {
      pendiente.value = { slots, sttConfidence }
      candidatos.value = encontrados
      showCandidatos.value = true
      estado.value = 'ambiguo'
      return
    }

    prepararVenta(decision.elegido.row, slots)
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
      await voice.startListening()
      if (gen !== generacion) return
      if (voice.estado.value === 'cancelled' || voice.estado.value === 'idle') {
        estado.value = 'idle'
        return
      }
      if (voice.estado.value === 'error') throw new Error(voice.error.value || 'No te entendí.')
      const texto = voice.transcript.value
      if (!texto) throw new Error('No te entendí. Prueba otra vez.')
      await procesar(texto, voice.confidence.value, gen)
    } catch (e) {
      if (gen !== generacion) return
      const mensaje = e?.message || 'Error de voz.'
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

  function seleccionarCandidato(candidato) {
    const datos = pendiente.value
    showCandidatos.value = false
    pendiente.value = null
    if (!candidato?.row || !datos) return
    prepararVenta(candidato.row, datos.slots)
  }

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
    venderPorVoz,
    reintentar,
    detenerEscucha,
    cancelarEscucha,
    invalidarCatalogoVoz,
    seleccionarCandidato,
    cancelar,
    limpiar,
    simular
  }
}
