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
import { computed, ref, watch } from 'vue'
import { Capacitor } from '@capacitor/core'
import { UMBRAL_PRODUCTO, decidirProducto, interpretar, resolverUbicacion } from '#shared/voz/gramatica'
import { voiceCommandSchema } from '#shared/schemas/voiceCommand'
import { fuzzyMatchProducts } from '../utils/voice/fuzzyMatchProducts'

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
  const perms = usePermisos()
  const conexion = useModoConexion()
  const { hayRed } = useSync()
  const toast = useToast()
  const route = useRoute()

  const estado = ref('idle') // idle | escuchando | interpretando | ambiguo | listo | error
  const candidatos = ref([])
  const prefill = ref(null)
  const producto = ref(null)
  const modo = ref('venta')
  const showCandidatos = ref(false)
  const pendiente = ref(null)

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
  const motivoNoDisponible = computed(() => {
    if (!configLista.value) return 'Cargando…'
    if (!perms.puedeAccion(ubicacion, 'voz')) return null
    if (!esNativo() && !voice.disponible.value) {
      return 'La voz web requiere un navegador compatible (Chrome/Edge) en contexto seguro (HTTPS).'
    }
    if (conexion.modo.value !== 'online') return 'Modo local: la voz no está disponible.'
    if (!hayRed.value) return 'Sin conexión: la voz no está disponible.'
    return null
  })

  const disponible = computed(() => tienePermiso.value && !motivoNoDisponible.value)
  const ocupado = computed(() => estado.value === 'escuchando' || estado.value === 'interpretando')

  function limpiar() {
    candidatos.value = []
    showCandidatos.value = false
    pendiente.value = null
    prefill.value = null
    producto.value = null
    modo.value = 'venta'
    estado.value = 'idle'
  }

  function prepararVenta(fila, slots) {
    const modoVenta = MODO_POR_TIPO[slots?.tipoVenta] || 'venta'
    prefill.value = {
      modo: modoVenta,
      cantidad: Number(slots?.cantidad) || 1,
      tipoVenta: slots?.tipoVenta || 'directa',
      precioVentaUsado: slots?.precioUnitario == null ? null : Number(slots.precioUnitario),
      clienteHint: slots?.clienteHint || null
    }
    modo.value = modoVenta
    producto.value = fila
    estado.value = 'listo'
  }

  /** Saldos de una ubicación. En quiosco se excluyen los productos no vendibles. */
  async function catalogoDe(ubi) {
    const filas = await inv.cargarSaldos() ?? []
    return ubi === 'quiosco' ? filas.filter(f => f.seVende !== false) : filas
  }

  async function procesar(texto, sttConfidence = 0) {
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

    const destino = resolverUbicacion(slots, ubicacion)
    if (destino.conflicto) {
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
    const base = catalogo.map(f => ({ id: f.productoId, name: f.nombre, canonicalSpeak: f.nombre }))
    const encontrados = fuzzyMatchProducts(slots.productoHint, base)
      .map(c => ({ ...c, row: catalogo.find(f => f.productoId === c.product.id) }))
      .filter(c => c.row)

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

    limpiar()
    estado.value = 'escuchando'
    try {
      await voice.startListening({ language: 'es-ES' })
      if (voice.estado.value === 'cancelled') {
        estado.value = 'idle'
        return
      }
      if (voice.estado.value === 'error') throw new Error(voice.error.value || 'No te entendí.')
      const texto = voice.transcript.value
      if (!texto) throw new Error('No te entendí. Prueba otra vez.')
      await procesar(texto, voice.confidence.value)
    } catch (e) {
      estado.value = 'error'
      toast.add({ title: 'Voz', description: e?.message || 'Error de voz.', color: 'error' })
    }
  }

  function seleccionarCandidato(candidato) {
    const datos = pendiente.value
    showCandidatos.value = false
    pendiente.value = null
    if (!candidato?.row || !datos) return
    prepararVenta(candidato.row, datos.slots)
  }

  function cancelar() {
    limpiar()
  }

  /** Solo dev: ejercita el pipeline sin micrófono (input "simular voz"). */
  async function simular(texto) {
    if (!import.meta.dev) return
    limpiar()
    try {
      await procesar(texto, 0.95)
    } catch (e) {
      estado.value = 'error'
      toast.add({ title: 'Voz (simulada)', description: e?.message || 'Error.', color: 'error' })
    }
  }

  // Auto-disparo por deeplink/widget: `?voice=1`. Se espera a que permisos y
  // modo carguen para no fallar por el default 'local'.
  watch(
    [() => route.query.voice, configLista, disponible, motivoNoDisponible],
    ([consulta, lista, listo, motivo]) => {
      const query = Array.isArray(consulta) ? consulta[0] : consulta
      if (query !== '1' || !lista) return
      const clave = route.fullPath
      if (consumido === clave) return
      consumido = clave
      if (!listo) {
        if (motivo && motivo !== 'Cargando…') {
          toast.add({ title: 'Voz', description: motivo, color: 'warning' })
        }
        return
      }
      void venderPorVoz()
    },
    { immediate: true }
  )

  return {
    estado,
    ocupado,
    disponible,
    micVisible,
    motivoNoDisponible,
    candidatos,
    showCandidatos,
    prefill,
    producto,
    modo,
    venderPorVoz,
    seleccionarCandidato,
    cancelar,
    limpiar,
    simular
  }
}
