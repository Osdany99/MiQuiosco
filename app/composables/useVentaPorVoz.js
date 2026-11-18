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
  extraerSlots,
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
import { buscarClienteDeuda, distribuirCobro, formatearDeuda, resumirDeudas, saldoTotalDeudas } from '#shared/voz/deudas'
import { formatearDia, formatearGanancia, resumirDia } from '#shared/voz/dia'
import { rangoDeIso } from '#shared/voz/fechas'
import { formatearCaja, resumirCaja } from '#shared/voz/caja'
import { TABLES } from '#shared/tables'
import { fraseVenta, fraseVentaMultiple, fraseEntrada, fraseCambioPrecio, fraseTraspaso, fraseClienteAlta, fraseMover, fraseCuadre, fraseStockInsuficiente, fraseFiado, fraseCobro, FRASE_CONFIRMAR, FRASE_AYUDA, FRASE_NADA_QUE_REPETIR } from '../utils/voice/frasesVoz'

import { resolverVenta as resolverVentaPura } from '../utils/voice/resolverVenta'
import { resolverCambioPrecio, resolverEntradaInventario, resolverTraspaso } from '../utils/voice/resolverAsistido'
import { agruparPorProducto, segmentarVentaMultiple } from '#shared/voz/multi'
import { proyectarStock } from '../utils/voice/pendientes'
import { ajustarCantidadVoz } from '../utils/voice/prefill'
import { useVozAlias } from './useVozAlias'
import { useConfirmacionVoz } from './useConfirmacionVoz'
import { useVoiceZeroTouch } from './useVoiceZeroTouch'
import { useVozDisparo } from './useVozDisparo'
import { evaluarDisparoVoz, ubicacionActiva } from '../utils/voice/disparoVoz'
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
  const alias = useVozAlias()
  const perms = usePermisos()
  const conexion = useModoConexion()
  const { hayRed } = useSync()
  const vozLexico = useVozLexico()
  const confirmacion = useConfirmacionVoz()
  const zeroTouch = useVoiceZeroTouch()
  const disparo = useVozDisparo()
  const snapshotVoz = useVozSnapshot()
  // Caja: solo lectura del cuadre abierto y sus líneas (nunca se crea ni se
  // guarda un cuadre desde la voz).
  const cuadresRepo = useRepo(TABLES.cuadres, { toast: false })
  const cuadreItemsRepo = useRepo(TABLES.cuadre_items, { toast: false })
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
  /**
 * Acción que no tiene formulario (mover producto). El layout la lee, la habla y
 * pide el «sí» SIEMPRE, sin mirar el switch de confirmación.
 */
  const accionSinFormulario = ref(null)
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
   * Venta con varias líneas en una sola frase («3 panes y 2 refrescos»).
   * El formulario recibe las líneas resueltas y las registra en un solo
   * `registrarVentaDirecta`; la voz sigue sin escribir nada por su cuenta.
   */
  function prepararVentaMultiple(accion) {
    const ubi = accion?.destino?.ubicacion || accion?.ubicacion || ubicacion
    const lineas = (accion?.lineas ?? []).map(l => ({
      productoId: l.productoId,
      nombre: l.nombre,
      cantidad: l.cantidad,
      precioVentaUsado: l.precioUnitario,
      disponible: l.disponible,
      fila: l.fila
    }))
    if (lineas.length < 2) {
      // «2 panes y 3 panes»: un solo producto, pero la cantidad ya está sumada.
      const unica = lineas[0]
      return prepararVenta(
        unica?.fila ?? null,
        {
          cantidad: unica?.cantidad ?? 1,
          tipoVenta: 'directa',
          precioUnitario: unica?.precioUnitario ?? null,
          clienteHint: null
        },
        ubi
      )
    }
    prefill.value = {
      modo: 'venta',
      ubicacion: ubi,
      cantidad: lineas.reduce((s, l) => s + l.cantidad, 0),
      tipoVenta: 'directa',
      precioVentaUsado: null,
      clienteHint: null,
      clienteId: null,
      lineas
    }
    modo.value = 'venta'
    // El primer producto abre el diálogo (el layout escucha `producto`), pero
    // el formulario pinta la lista completa de `prefill.lineas`.
    producto.value = lineas[0].fila
    estado.value = 'listo'
    voice.registrar('voz.listo', {
      producto: lineas.map(l => l.nombre).join(' + '),
      cantidad: prefill.value.cantidad,
      ubicacion: ubi,
      lineas: lineas.length
    })
    programarReadBack(producto.value)
  }

  /**
   * Habla la venta prellenada con su importe y, si toca, la petición de
   * confirmación. Se reutiliza al corregir la cantidad para leer la nueva.
   */
  function programarReadBack(fila) {
    const filaActual = fila ?? producto.value
    readBackPromise.value = (async () => {
      // Venta con varias líneas: se leen todas y el total.
      if (Array.isArray(prefill.value?.lineas) && prefill.value.lineas.length) {
        const lugar = prefill.value.ubicacion === 'quiosco' ? 'quiosco' : 'almacén'
        const total = prefill.value.lineas.reduce(
          (s, l) => s + (Number(l.cantidad) || 0) * (Number(l.precioVentaUsado) || 0),
          0
        )
        let texto = fraseVentaMultiple({ lineas: prefill.value.lineas, lugar, importe: total })
        readBackIncluyeConfirmacion.value = Boolean(confirmacionHablada.value) && tts.habilitado.value
        if (readBackIncluyeConfirmacion.value) texto = `${texto} ${FRASE_CONFIRMAR}`
        readBackTexto.value = texto
        try {
          if (tts?.speak) await tts.speak(texto)
          else toast.add({ title: 'Voz (lectura)', description: texto, color: 'neutral', duration: 8000 })
        } catch {
          /* noop */
        }
        return
      }
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
    // En una venta de varios productos la corrección hablada no sabe a qué
    // línea se refiere: se corrige en el formulario, no se adivina.
    if (Array.isArray(actual.lineas) && actual.lineas.length) {
      const mensaje = 'Esta venta lleva varios productos: corrige las cantidades en el formulario.'
      ultimoError.value = mensaje
      try {
        await tts.speak(mensaje)
      } catch {
        /* noop */
      }
      toast.add({ title: 'Voz', description: mensaje, color: 'warning', duration: 8000 })
      return { ok: false, motivo: 'multiple' }
    }
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

  // Los alias son del puesto: al entrar o cambiar de puesto se releen.
  watch(
    () => auth.usuarioActual.value?.puestoId ?? null,
    (pid) => {
      if (pid) void alias.cargar({ forzar: true }).catch(() => {})
    },
    { immediate: true }
  )

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

    // El catálogo se carga para la ubicación destino (dicha o almacén).
    const destino = resolverUbicacion(slots)
    const catalogo = await catalogoDe(destino.ubicacion)
    if (!vigente()) return { tipo: 'cancelado' }

    const accion = resolverVentaPura({
      slots,
      catalogo,
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

  /**
   * Resuelve una venta dictada con VARIAS líneas («3 panes y 2 refrescos»).
   * Devuelve una acción `venta_multiple` o `null` para caer al flujo normal de
   * una sola línea. Solo con la app abierta: la revisión del buzón sigue de uno
   * en uno.
   */
  async function resolverVentaMultiAccion(texto, sttConfidence = 0, vigente = () => true, opciones = {}) {
    if (opciones.ventaDirecta) return null
    const multi = segmentarVentaMultiple(texto, vozLexico.lexico.value)
    if (!multi) return null
    // El formulario múltiple registra una venta directa; casa, familiar o
    // regalo siguen de uno en uno, donde el modo está claro.
    if ((multi.tipoVenta || 'directa') !== 'directa') return null

    const destino = resolverUbicacion({ ubicacion: multi.ubicacion })
    const catalogo = await catalogoDe(destino.ubicacion)
    if (!vigente()) return { tipo: 'cancelado' }

    // «Pan con queso» puede ser UN producto que se llama así: si el dictado
    // completo coincide con un nombre del catálogo, no se parte.
    const unico = extraerSlots('venta_directa', texto, vozLexico.lexico.value)
    if (esProductoUnico(catalogo, unico?.productoHint)) return null

    const resueltas = []
    for (const segmento of multi.segmentos) {
      const accion = resolverVentaPura({
        slots: { ...segmento, ubicacion: multi.ubicacion, tipoVenta: multi.tipoVenta },
        catalogo,
        sttConfidence,
        ventaDirecta: false
      })
      // Una sola duda (producto, stock o destino) y la frase vuelve al flujo
      // de una línea: se pregunta, no se inventa la línea.
      if (accion.tipo !== 'venta') return null
      if (accion.destino.ubicacion !== destino.ubicacion) return null
      resueltas.push(accion)
    }

    // «2 panes y 3 panes» es un solo renglón de 5; el stock se compara con la
    // suma, no línea a línea.
    const lineas = agruparPorProducto(resueltas.map(a => ({
      productoId: a.fila.productoId,
      nombre: a.fila.nombre,
      cantidad: a.cantidad,
      precioUnitario: a.precioUnitario,
      disponible: Number(a.fila?.[destino.ubicacion] ?? 0),
      fila: a.fila
    })))
    if (!lineas || !lineas.length) return null
    if (lineas.some(l => l.cantidad > l.disponible)) return null

    const total = Math.round(
      lineas.reduce((s, l) => s + l.cantidad * (Number(l.precioUnitario) || 0), 0) * 100
    ) / 100
    voice.registrar('voz.multi', {
      ubicacion: destino.ubicacion,
      lineas: lineas.length,
      total
    })
    return { tipo: 'venta_multiple', lineas, destino, ubicacion: destino.ubicacion, sttConfidence, total }
  }

  /** ¿El dictado completo corresponde a un único producto del catálogo? */
  function esProductoUnico(catalogo, hint) {
    const buscado = normalizar(hint)
    if (!buscado) return false
    if ((catalogo ?? []).some(f => normalizar(f?.nombre) === buscado)) return true
    return (alias.paraEmparejar.value ?? []).some(a => normalizar(a?.texto) === buscado)
  }

  /**
   * Fase K — entrada de lote al almacén. Solo jefe con `/almacen`. El resolver
   * elige el producto; el costo y la cantidad van al formulario, nunca a la BD.
   */
  async function resolverEntradaAccion(slots, sttConfidence = 0, vigente = () => true) {
    if (!auth.esJefe.value || !perms.puedeVista('almacen')) {
      return { tipo: 'aviso', mensaje: 'Solo el jefe puede registrar entradas desde el almacén.' }
    }
    const catalogo = await catalogoDe('almacen', { soloVendibles: false })
    if (!vigente()) return { tipo: 'cancelado' }
    const resuelto = resolverEntradaInventario({ slots }, catalogo, { sttConfidence })
    if (resuelto.tipo === 'ambiguo') {
      return {
        tipo: 'ambiguo',
        comando: 'entrada_inventario',
        candidatos: resuelto.candidatos,
        slots,
        sttConfidence,
        encontrados: resuelto.candidatos.length,
        efectivo: resuelto.efectivo
      }
    }
    if (resuelto.tipo !== 'ok') return { ...resuelto, comando: 'entrada_inventario', sttConfidence }
    return {
      tipo: 'entrada',
      comando: 'entrada_inventario',
      fila: resuelto.fila,
      cantidad: resuelto.cantidad,
      precioUnitario: resuelto.precioUnitario,
      slots,
      sttConfidence
    }
  }

  /** Fase L — cambio del precio de venta. Solo jefe con `/productos`. */
  async function resolverCambioPrecioAccion(slots, sttConfidence = 0, vigente = () => true) {
    if (!auth.esJefe.value || !perms.puedeVista('productos')) {
      return { tipo: 'aviso', mensaje: 'Solo el jefe puede cambiar el precio de un producto.' }
    }
    const catalogo = await catalogoDe('almacen', { soloVendibles: false })
    if (!vigente()) return { tipo: 'cancelado' }
    const resuelto = resolverCambioPrecio({ slots }, catalogo, { sttConfidence })
    if (resuelto.tipo === 'ambiguo') {
      return {
        tipo: 'ambiguo',
        comando: 'cambio_precio',
        candidatos: resuelto.candidatos,
        slots,
        sttConfidence,
        encontrados: resuelto.candidatos.length,
        efectivo: resuelto.efectivo
      }
    }
    if (resuelto.tipo !== 'ok') return { ...resuelto, comando: 'cambio_precio', sttConfidence }
    return {
      tipo: 'cambio_precio',
      comando: 'cambio_precio',
      fila: resuelto.fila,
      precioActual: resuelto.precioActual,
      precio: resuelto.precio,
      slots,
      sttConfidence
    }
  }

  /**
   * Mover un producto en el catálogo. Sin formulario: se lee y se confirma por
   * voz siempre (ignora el switch de confirmación, porque no hay dónde pulsar).
   */
  async function resolverMoverAccion(slots, sttConfidence = 0) {
    if (!auth.esJefe.value || !perms.puedeVista('productos')) {
      return { tipo: 'aviso', mensaje: 'Solo el jefe puede ordenar el catálogo.' }
    }
    const productos = await inv.cargarProductos()
    if (!productos.length) {
      return { tipo: 'error', mensaje: 'No hay productos en el catálogo.' }
    }
    const emparejar = crearEmparejador(productos, sttConfidence, alias.paraEmparejar.value)
    const elegir = (hint) => {
      const encontrados = emparejar(hint || '')
      if (!encontrados.length) return null
      const decision = decidirProducto(encontrados, { umbral: UMBRAL_PRODUCTO, sttConfidence })
      return decision.elegido?.row ?? null
    }

    const fila = elegir(slots?.productoHint)
    if (!fila) {
      return { tipo: 'error', mensaje: `No encontré "${slots?.productoHint || 'ese producto'}" en el catálogo.` }
    }

    const sinMovido = productos.filter(p => p.id !== fila.id)
    let indice = sinMovido.length
    let referencia = null

    if (slots?.posicion === 'principio') {
      indice = 0
    } else if (slots?.referenciaHint) {
      referencia = elegir(slots.referenciaHint)
      if (!referencia) {
        return { tipo: 'error', mensaje: `No encontré "${slots.referenciaHint}" en el catálogo.` }
      }
      if (referencia.id === fila.id) {
        return { tipo: 'aviso', mensaje: 'No puedo mover un producto respecto a sí mismo.' }
      }
      const idx = sinMovido.findIndex(p => p.id === referencia.id)
      indice = slots.posicion === 'debajo' ? idx + 1 : idx
    }

    const texto = fraseMover({ nombre: fila.nombre, referencia: referencia?.nombre, posicion: slots?.posicion })
    return { tipo: 'mover', fila, referencia, indice, texto, sttConfidence }
  }

  /** Alta de cliente por voz: nombre dictado, sin duplicar parecidos. */
  async function resolverClienteAlta(slots, sttConfidence = 0) {
    if (!auth.esJefe.value || !perms.puedeVista('clientes')) {
      return { tipo: 'aviso', mensaje: 'Solo el jefe puede agregar clientes.' }
    }
    const nombre = String(slots?.nombre ?? '').trim()
    if (!nombre) {
      return { tipo: 'aviso', mensaje: '¿Cómo se llama el cliente? Prueba: agrega el cliente Adrián.' }
    }
    const pid = auth.usuarioActual.value?.puestoId
    const lista = pid
      ? await fiado.cargarClientes(pid, { incluirSinCliente: false }).catch(() => [])
      : []
    const parecidos = clientesSimilares(nombre, lista, { umbral: 0.86 })
    if (parecidos.length) {
      return {
        tipo: 'aviso',
        mensaje: `Ya existe «${parecidos[0].cliente.nombre}». Revisa /clientes antes de crear otro.`
      }
    }
    return { tipo: 'cliente_alta', slots: { nombre }, sttConfidence }
  }

  /** Fase N — traspaso almacén → quiosco. Solo jefe con ambas ubicaciones. */ async function resolverTraspasoAccion(slots, sttConfidence = 0, vigente = () => true) {
    if (!auth.esJefe.value || !perms.puedeVista('almacen') || !perms.puedeVista('quiosco')) {
      return { tipo: 'aviso', mensaje: 'Solo el jefe puede traspasar mercancía entre el almacén y el quiosco.' }
    }
    if (slots?.destino === 'almacen') {
      return { tipo: 'aviso', mensaje: 'El traspaso por voz solo va del almacén al quiosco. Para lo contrario usa el formulario.' }
    }
    const catalogo = await catalogoDe('almacen', { soloVendibles: false })
    if (!vigente()) return { tipo: 'cancelado' }
    const resuelto = resolverTraspaso({ slots }, catalogo, { sttConfidence })
    if (resuelto.tipo === 'ambiguo') {
      return {
        tipo: 'ambiguo',
        comando: 'traspaso',
        candidatos: resuelto.candidatos,
        slots,
        sttConfidence,
        encontrados: resuelto.candidatos.length,
        efectivo: resuelto.efectivo
      }
    }
    if (resuelto.tipo !== 'ok') return { ...resuelto, comando: 'traspaso', sttConfidence }
    return {
      tipo: 'traspaso',
      comando: 'traspaso',
      fila: resuelto.fila,
      cantidad: resuelto.cantidad,
      disponible: resuelto.disponible,
      slots,
      sttConfidence
    }
  }

  /** Fase M — cuadre: solo lleva a la pantalla y lee totales. */
  function resolverCuadreAccion(slots, sttConfidence = 0) {
    if (!perms.puedeVista('cuadre')) {
      return { tipo: 'aviso', mensaje: 'No tienes permiso para abrir el cuadre.' }
    }
    return { tipo: 'cuadre', slots, sttConfidence }
  }

  /**
   * Prepara una entrada de lote (Fase K). El formulario se abre con producto,
   * cantidad y costo; la voz no escribe nada.
   */
  function prepararEntrada(accion) {
    prefill.value = {
      modo: 'entrada',
      ubicacion: 'almacen',
      cantidad: accion.cantidad,
      precioUnitario: accion.precioUnitario
    }
    producto.value = accion.fila
    modo.value = 'entrada'
    estado.value = 'listo'
    const texto = fraseEntrada({
      cantidad: accion.cantidad,
      nombre: accion.fila?.nombre,
      precio: accion.precioUnitario
    })
    toast.add({ title: 'Entrada al almacén', description: texto, color: 'neutral', duration: 8000 })
    voice.registrar('voz.entrada', {
      producto: accion.fila?.nombre ?? '',
      cantidad: accion.cantidad,
      precio: accion.precioUnitario ?? 0
    })
    hablarAsistido(texto)
  }

  /** Prepara el cambio de precio (Fase L): actual y nuevo, a la vista. */
  function prepararCambioPrecio(accion) {
    prefill.value = {
      modo: 'precio',
      productoId: accion.fila?.productoId ?? null,
      precioActual: accion.precioActual,
      precio: accion.precio
    }
    producto.value = accion.fila
    modo.value = 'precio'
    estado.value = 'listo'
    const texto = fraseCambioPrecio({
      nombre: accion.fila?.nombre,
      actual: accion.precioActual,
      nuevo: accion.precio
    })
    toast.add({ title: 'Cambio de precio', description: texto, color: 'neutral', duration: 8000 })
    voice.registrar('voz.precio', {
      producto: accion.fila?.nombre ?? '',
      actual: accion.precioActual,
      nuevo: accion.precio
    })
    hablarAsistido(texto)
  }

  /** Prepara el alta de cliente: el formulario abre con el nombre dictado. */
  function prepararClienteAlta(accion) {
    const nombre = String(accion?.slots?.nombre ?? '').trim()
    prefill.value = { modo: 'cliente', nombre }
    // El layout abre el diálogo al ver `producto`: se usa un marcador con el
    // nombre para no meter un cliente en el flujo de venta.
    producto.value = { nombre, esCliente: true }
    modo.value = 'cliente'
    estado.value = 'listo'
    const texto = fraseClienteAlta({ nombre })
    toast.add({ title: 'Nuevo cliente', description: texto, color: 'neutral', duration: 8000 })
    voice.registrar('voz.cliente', { nombre })
    hablarAsistido(texto)
  }

  /** Prepara el traspaso almacén → quiosco (Fase N). */ function prepararTraspaso(accion) {
    prefill.value = {
      modo: 'traspaso',
      cantidad: accion.cantidad
    }
    producto.value = accion.fila
    modo.value = 'traspaso'
    estado.value = 'listo'
    const texto = fraseTraspaso({ cantidad: accion.cantidad, nombre: accion.fila?.nombre })
    toast.add({ title: 'Traspaso al quiosco', description: texto, color: 'neutral', duration: 8000 })
    voice.registrar('voz.traspaso', {
      producto: accion.fila?.nombre ?? '',
      cantidad: accion.cantidad
    })
    hablarAsistido(texto)
  }

  /**
   * Cuadre por voz (Fase M): lleva a `/cuadre` y lee los totales. Cerrar nunca
   * se ejecuta aquí: el jefe escribe el dinero real y pulsa el botón. Si no hay
   * cuadre abierto no se navega al cerrar (abrir la pantalla lo crearía).
   */
  async function ejecutarCuadre(accion, vigente = () => true) {
    const esCerrar = accion?.slots?.accion === 'cerrar'

    if (esCerrar && !(await leerResumenCaja())) {
      const texto = 'No hay un cuadre abierto.'
      ultimaRespuestaVoz.value = texto
      toast.add({ title: 'Cuadre', description: texto, color: 'neutral', duration: 8000 })
      try {
        await tts.speak(texto)
      } catch {
        /* noop */
      }
      if (estado.value !== 'idle') estado.value = 'idle'
      return
    }

    if (vistaDeRuta(route.path) !== 'cuadre') {
      await manejarNavegacion({ destino: 'cuadre' }, vigente)
    }
    if (!vigente()) return

    // Se lee después de navegar: abrir la pantalla crea el cuadre del día si no
    // existía, y lo que se habla tiene que ser lo que el jefe va a ver.
    const resumen = await leerResumenCaja()
    const texto = fraseCuadre({
      accion: esCerrar ? 'cerrar' : 'abrir',
      hablaCaja: formatearCaja(resumen).habla,
      sinCuadre: !resumen
    })
    ultimaRespuestaVoz.value = texto
    // El aviso en pantalla sobrevive a la navegación: es lo que el jefe lee.
    toast.add({
      title: esCerrar ? 'Cerrar el cuadre' : 'Cuadre del día',
      description: texto,
      color: 'neutral',
      duration: 10000
    })
    try {
      await tts.speak(texto)
    } catch {
      /* noop */
    }
    if (estado.value !== 'idle') estado.value = 'idle'
  }

  /**
   * Aviso hablado de un comando asistido. Con la confirmación por voz apagada
   * no habla: el formulario queda para el botón. El «sí» se pide desde el
   * layout, que es quien tiene el micrófono de la confirmación.
   */
  function hablarAsistido(texto) {
    ultimaRespuestaVoz.value = texto
    readBackTexto.value = texto
    readBackIncluyeConfirmacion.value = false
    readBackPromise.value = (async () => {
      if (!tts.habilitado.value) return
      try {
        await tts.speak(texto)
      } catch {
        /* noop */
      }
    })()
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

  /** Resumen del día («cómo va el día», «cuánto vendí hoy»). */
  function resolverConsultaDia(slots, sttConfidence = 0) {
    // El resumen del día es información del cuadre: un trabajador no lo oye
    // aunque tenga permiso de voz.
    if (!auth.esJefe.value) {
      return {
        tipo: 'aviso',
        mensaje: 'Solo el jefe puede ver el resumen del día.',
        auditar: { comando: 'consulta_dia', motivo: 'sin_permiso', confianza: Number(sttConfidence) || 0 }
      }
    }
    return { tipo: 'consultar_dia', slots }
  }

  /** Ganancia del día («cuánto gané hoy»). Solo jefe. */
  function resolverConsultaGanancia(slots, sttConfidence = 0) {
    if (!auth.esJefe.value) {
      return {
        tipo: 'aviso',
        mensaje: 'Solo el jefe puede ver la ganancia del día.',
        auditar: { comando: 'consulta_ganancia', motivo: 'sin_permiso', confianza: Number(sttConfidence) || 0 }
      }
    }
    return { tipo: 'consultar_ganancia', slots }
  }

  /** Caja del cuadre abierto («cómo va la caja»). Solo jefe. */
  function resolverConsultaCaja(slots, sttConfidence = 0) {
    if (!auth.esJefe.value) {
      return {
        tipo: 'aviso',
        mensaje: 'Solo el jefe puede ver la caja.',
        auditar: { comando: 'consulta_caja', motivo: 'sin_permiso', confianza: Number(sttConfidence) || 0 }
      }
    }
    return { tipo: 'consultar_caja', slots }
  }

  /**
   * Resumen de un día. Sin fecha usa el snapshot (hoy, rápido y offline); con
   * fecha, lee las ventas de ese día concreto y lo calcula igual.
   */
  async function resumenDeDia(fecha) {
    const rango = fecha ? rangoDeIso(fecha) : null
    if (!rango) return { resumen: await snapshotVoz.resumenDelDia(), rango: null }
    const ventas = await inv.cargarVentasDirectas({ desde: rango.inicio, hasta: rango.hasta }).catch(() => [])
    return {
      resumen: resumirDia({ ventas, desde: rango.inicio, hasta: rango.hasta }),
      rango
    }
  }

  /** Resumen del día («cómo va el día», «cuánto vendí el martes»). */
  async function responderDia(accion) {
    const { resumen, rango } = await resumenDeDia(accion?.slots?.fecha ?? null)
    const result = formatearDia(resumen, { cuando: rango?.etiqueta ?? null })
    ultimaRespuestaVoz.value = result.habla
    toast.add({
      title: result.titulo,
      description: result.descripcion,
      color: result.tipo === 'dia_vacio' ? 'neutral' : 'success',
      duration: 8000
    })
    try {
      await tts.speak(result.habla)
    } catch {
      /* noop */
    }
    if (estado.value !== 'idle') estado.value = 'idle'
  }

  /** Ganancia del día («cuánto gané hoy», «la ganancia del martes»). */
  async function responderGanancia(accion) {
    const { resumen, rango } = await resumenDeDia(accion?.slots?.fecha ?? null)
    const result = formatearGanancia(resumen, { cuando: rango?.etiqueta ?? null })
    ultimaRespuestaVoz.value = result.habla
    toast.add({
      title: result.titulo,
      description: result.descripcion,
      color: result.tipo === 'ganancia_vacia' ? 'neutral' : 'success',
      duration: 8000
    })
    try {
      await tts.speak(result.habla)
    } catch {
      /* noop */
    }
    if (estado.value !== 'idle') estado.value = 'idle'
  }

  /**
   * Lee el cuadre abierto y sus líneas SIN crear ni escribir nada. Devuelve el
   * resumen que hablan «cómo va la caja» y el cierre asistido (Fase M).
   */
  async function leerResumenCaja() {
    const puestoId = auth.usuarioActual.value?.puestoId ?? null
    try {
      const { data: filas } = await cuadresRepo.readAll()
      const abierto = (filas ?? [])
        .filter(c => c?.estado === 'abierto' && c?.puestoId === puestoId)
        .sort((a, b) => String(b.fecha ?? '').localeCompare(String(a.fecha ?? '')))[0]
      if (!abierto) return null
      const { data: items } = await cuadreItemsRepo.readAll({ query: { cuadreId: abierto.id } })
      const lineas = (items ?? []).filter(l => l?.cuadreId === abierto.id)
      return resumirCaja({ cuadre: abierto, lineas })
    } catch {
      return null
    }
  }

  /**
   * Caja del cuadre abierto («cómo va la caja»): efectivo esperado, fiado y
   * transferencias. Solo lee: si no hay cuadre abierto lo dice y no crea nada.
   */
  async function responderCaja() {
    const resumen = await leerResumenCaja()

    const result = formatearCaja(resumen)
    ultimaRespuestaVoz.value = result.habla
    toast.add({
      title: result.titulo,
      description: result.descripcion,
      color: result.tipo === 'caja_sin_cuadre' ? 'neutral' : 'success',
      duration: 8000
    })
    try {
      await tts.speak(result.habla)
    } catch {
      /* noop */
    }
    if (estado.value !== 'idle') estado.value = 'idle'
  }

  /** Deudas del puesto («cuánto debe Juan», «quién me debe más»). */
  async function responderDeuda(accion) {
    const result = formatearDeuda(accion.resumen, accion.encontrado, accion.ambito)
    ultimaRespuestaVoz.value = result.habla
    toast.add({
      title: result.titulo,
      description: result.descripcion,
      color: result.tipo === 'sin_deudas' || result.tipo === 'sin_deuda' ? 'neutral' : 'success',
      duration: 8000
    })
    try {
      await tts.speak(result.habla)
    } catch {
      /* noop */
    }
    if (estado.value !== 'idle') estado.value = 'idle'
  }

  /**
   * Fiar SIN efectos: cliente claro, producto del catálogo y stock suficiente.
   *
   * Reutiliza el resolvedor de venta para el producto (misma ambigüedad y mismo
   * stock proyectado) y añade lo propio del fiado: el cliente y el aviso cuando
   * hay varios parecidos.
   */
  async function resolverFiadoAccion(slots, sttConfidence = 0, vigente = () => true) {
    if (!perms.puedeVista('deudas')) {
      return {
        tipo: 'aviso',
        mensaje: 'No tienes permiso para fiar.',
        auditar: { comando: 'venta_fiada', motivo: 'sin_permiso', confianza: Number(sttConfidence) || 0 }
      }
    }

    const pid = auth.usuarioActual.value?.puestoId
    if (!pid) {
      return {
        tipo: 'error',
        comando: 'venta_fiada',
        motivo: 'sin_puesto',
        mensaje: 'No hay un puesto activo para fiar.',
        texto: slots?.productoHint || ''
      }
    }

    const hintCliente = String(slots?.clienteHint ?? '').trim()
    if (!hintCliente) {
      return {
        tipo: 'aviso',
        mensaje: '¿A quién se lo fío? Di por ejemplo: fía dos panes a Juan.',
        auditar: { comando: 'venta_fiada', motivo: 'sin_cliente', confianza: Number(sttConfidence) || 0 }
      }
    }

    const clientes = await fiado.cargarClientes(pid, { incluirSinCliente: false }).catch(() => [])
    const parecidos = clientesSimilares(hintCliente, clientes, { umbral: 0.72 })
    if (!parecidos.length) {
      return {
        tipo: 'error',
        comando: 'venta_fiada',
        motivo: 'cliente_no_encontrado',
        mensaje: `No encontré a "${hintCliente}" entre los clientes.`,
        texto: hintCliente,
        auditar: { comando: 'venta_fiada', motivo: 'cliente_no_encontrado', confianza: Number(sttConfidence) || 0 }
      }
    }

    const [mejor, segundo] = parecidos
    if (segundo && mejor.similitud - segundo.similitud < 0.05) {
      const nombres = parecidos.slice(0, 3).map(p => p.cliente.nombre).join(', ')
      return {
        tipo: 'aviso',
        mensaje: `Hay varios clientes parecidos: ${nombres}. Di el nombre completo.`,
        auditar: { comando: 'venta_fiada', motivo: 'cliente_ambiguo', confianza: Number(sttConfidence) || 0 }
      }
    }
    if (!vigente()) return { tipo: 'cancelado' }

    // El cliente ya está decidido: el resolvedor de venta no vuelve a buscarlo.
    const accion = await resolverVentaAccion(
      { ...slots, clienteId: mejor.cliente.id, clienteHint: '', tipoVenta: 'directa' },
      sttConfidence,
      vigente
    )
    if (accion.tipo === 'venta') {
      return {
        tipo: 'fiar',
        fila: accion.fila,
        cliente: mejor.cliente,
        cantidad: Number(accion.slots?.cantidad) || Number(slots?.cantidad) || 1,
        importe: accion.importe,
        destino: accion.destino,
        slots: accion.slots
      }
    }
    if (accion.tipo === 'ambiguo') {
      return {
        ...accion,
        comando: 'venta_fiada',
        cliente: mejor.cliente,
        slots: { ...accion.slots, clienteId: mejor.cliente.id, clienteHint: hintCliente }
      }
    }
    return accion
  }

  /** Habla el prompt, abre el micrófono y espera sí/no (o una corrección). */
  async function escucharRespuestaVoz(prompt) {
    try {
      await tts.speak(prompt)
    } catch {
      /* noop */
    }
    // Sin espera previa: el arranque del motor ya hace de margen antieco, y así
    // un «sí» dicho en cuanto termina el anuncio no se pierde.
    const finAnuncio = Date.now()
    voice.reset()
    const escucha = voice.startListening({
      contexto: { modo: conexion.modo.value, red: hayRed.value }
    }).catch(() => {})
    // La ventana de los 6 s cuenta desde que el micrófono escucha de verdad.
    await voice.esperandoMicro({ timeoutMs: 2500 })
    const respuesta = await confirmacion.esperar({
      timeoutMs: zeroTouch.timeoutMs.value,
      prompt,
      desdeMs: finAnuncio
    })
    try {
      await voice.stopListening()
    } catch {
      /* noop */
    }
    await escucha
    voice.reset()
    return respuesta
  }

  /**
   * Cobro SIN efectos: cliente, deudas con saldo e importe. El reparto es FIFO
   * (la deuda más antigua primero) y se hace en `shared/voz/deudas.js`.
   */
  async function resolverCobroAccion(slots, sttConfidence = 0, vigente = () => true) {
    if (!perms.puedeVista('deudas')) {
      return {
        tipo: 'aviso',
        mensaje: 'No tienes permiso para cobrar deudas.',
        auditar: { comando: 'cobro_deuda', motivo: 'sin_permiso', confianza: Number(sttConfidence) || 0 }
      }
    }
    if (!auth.esJefe.value) {
      return {
        tipo: 'aviso',
        mensaje: 'Solo el jefe puede cobrar deudas.',
        auditar: { comando: 'cobro_deuda', motivo: 'sin_permiso', confianza: Number(sttConfidence) || 0 }
      }
    }

    const pid = auth.usuarioActual.value?.puestoId
    if (!pid) {
      return {
        tipo: 'error',
        comando: 'cobro_deuda',
        motivo: 'sin_puesto',
        mensaje: 'No hay un puesto activo para cobrar.',
        texto: slots?.clienteHint || ''
      }
    }

    const hintCliente = String(slots?.clienteHint ?? '').trim()
    if (!hintCliente) {
      return {
        tipo: 'aviso',
        mensaje: '¿A quién le cobro? Di por ejemplo: cobra 200 a Yunior.',
        auditar: { comando: 'cobro_deuda', motivo: 'sin_cliente', confianza: Number(sttConfidence) || 0 }
      }
    }

    const clientes = await fiado.cargarClientes(pid, { incluirSinCliente: false }).catch(() => [])
    const parecidos = clientesSimilares(hintCliente, clientes, { umbral: 0.72 })
    if (!parecidos.length) {
      return {
        tipo: 'error',
        comando: 'cobro_deuda',
        motivo: 'cliente_no_encontrado',
        mensaje: `No encontré a "${hintCliente}" entre los clientes.`,
        texto: hintCliente,
        auditar: { comando: 'cobro_deuda', motivo: 'cliente_no_encontrado', confianza: Number(sttConfidence) || 0 }
      }
    }

    const [mejor, segundo] = parecidos
    if (segundo && mejor.similitud - segundo.similitud < 0.05) {
      const nombres = parecidos.slice(0, 3).map(p => p.cliente.nombre).join(', ')
      return {
        tipo: 'aviso',
        mensaje: `Hay varios clientes parecidos: ${nombres}. Di el nombre completo.`,
        auditar: { comando: 'cobro_deuda', motivo: 'cliente_ambiguo', confianza: Number(sttConfidence) || 0 }
      }
    }
    if (!vigente()) return { tipo: 'cancelado' }

    const cliente = mejor.cliente
    const todas = await fiado.cargarDeudas().catch(() => [])
    const cuentas = (todas ?? []).filter(c => c?.clienteId === cliente.id && Number(c.saldoPendiente) > 0)
    if (!cuentas.length) {
      return {
        tipo: 'aviso',
        mensaje: `${cliente.nombre} no tiene deudas pendientes.`,
        auditar: { comando: 'cobro_deuda', motivo: 'sin_deuda', confianza: Number(sttConfidence) || 0 }
      }
    }

    const saldoTotal = saldoTotalDeudas(cuentas)
    const pedido = slots?.monto === 'todo'
      ? saldoTotal
      : Math.round((Number(slots?.monto) || 0) * 100) / 100
    if (!(pedido > 0)) {
      return {
        tipo: 'aviso',
        mensaje: 'No entendí cuánto cobrar. Di por ejemplo: cobra 200 a Yunior.',
        auditar: { comando: 'cobro_deuda', motivo: 'monto_invalido', confianza: Number(sttConfidence) || 0 }
      }
    }
    if (pedido > saldoTotal) {
      return {
        tipo: 'aviso',
        mensaje: `${cliente.nombre} debe ${saldoTotal} pesos; no puedo cobrar ${pedido}.`,
        auditar: { comando: 'cobro_deuda', motivo: 'monto_excedido', confianza: Number(sttConfidence) || 0 }
      }
    }

    const reparto = distribuirCobro(cuentas, pedido)
    if (!reparto.pagos.length || reparto.sobrante > 0) {
      return {
        tipo: 'aviso',
        mensaje: 'No pude repartir el cobro entre las deudas de ese cliente.',
        auditar: { comando: 'cobro_deuda', motivo: 'reparto_invalido', confianza: Number(sttConfidence) || 0 }
      }
    }

    return {
      tipo: 'cobrar',
      cliente,
      cuentas,
      pagos: reparto.pagos,
      monto: reparto.aplicado,
      saldoTotal,
      restante: Math.round((saldoTotal - reparto.aplicado) * 100) / 100,
      formaPago: slots?.formaPago === 'transferencia' ? 'transferencia' : 'efectivo',
      slots
    }
  }

  /** Fiar el producto elegido en el diálogo de candidatos. */
  function fiarCandidato(candidato, datos) {
    const fila = candidato?.row
    if (!fila) return
    const cantidad = Math.max(1, Math.trunc(Number(datos.slots?.cantidad) || 1))
    const precio = Number(fila.precioVentaActual) || 0
    const ubi = datos.slots?.ubicacion || ubicacion
    return prepararFiado({
      fila,
      cliente: datos.cliente,
      cantidad,
      importe: Math.round(precio * cantidad * 100) / 100,
      destino: { ubicacion: ubi },
      slots: datos.slots
    })
  }

  /**
   * Confirma y registra un fiado. La deuda se crea directa (fuera de cuadre),
   * igual que desde `/deudas`: descuenta stock y congela el costo.
   */
  async function prepararFiado(accion) {
    const fila = accion?.fila
    const cliente = accion?.cliente
    if (!fila?.productoId || !cliente?.id) {
      estado.value = 'idle'
      throw new Error('Falta el producto o el cliente para fiar.')
    }

    const ubi = accion.destino?.ubicacion === 'almacen' ? 'almacen' : (accion.destino?.ubicacion || ubicacion)
    const precio = Number(fila.precioVentaActual) || 0
    let cantidad = Math.max(1, Math.trunc(Number(accion.cantidad) || 1))
    let importe = Number(accion.importe) || Math.round(precio * cantidad * 100) / 100
    let frase = fraseFiado({ cantidad, nombre: fila.nombre, cliente: cliente.nombre, importe })

    modo.value = 'fiado'
    estado.value = 'confirmando'
    ultimaRespuestaVoz.value = frase
    readBackTexto.value = frase
    readBackIncluyeConfirmacion.value = true
    toast.add({ title: 'Fiar por voz', description: frase, color: 'success', duration: 8000 })

    // Sin lectura de voz no hay confirmación posible: mejor no fiar nada que
    // fiar a ciegas. La deuda se hace desde /deudas.
    if (!tts.habilitado.value) {
      estado.value = 'idle'
      toast.add({
        title: 'Voz',
        description: 'La lectura de voz está apagada: no se fió nada.',
        color: 'warning'
      })
      return
    }

    /** Una escucha corta: solo para el sí/no (o una corrección de cantidad). */
    let correcciones = 0
    let resultado = 'timeout'
    while (true) {
      const respuesta = await escucharRespuestaVoz(frase)
      resultado = respuesta.resultado
      if (resultado !== 'corregir') break

      if (correcciones >= 2) {
        resultado = 'abandonado'
        break
      }
      const nueva = Math.trunc(Number(respuesta.cantidad) || 0)
      const disponible = Number(fila?.[ubi]) || 0
      if (nueva < 1 || nueva > disponible) {
        resultado = 'sin_stock'
        break
      }
      cantidad = nueva
      importe = Math.round(precio * cantidad * 100) / 100
      frase = fraseFiado({ cantidad, nombre: fila.nombre, cliente: cliente.nombre, importe })
      ultimaRespuestaVoz.value = frase
      readBackTexto.value = frase
      correcciones++
    }

    if (resultado !== 'afirmado') {
      estado.value = 'idle'
      const mensaje = resultado === 'negado'
        ? 'Cancelado.'
        : (resultado === 'sin_stock'
            ? 'No hay stock suficiente. No se fió nada.'
            : 'Sin respuesta. No se fió nada.')
      toast.add({ title: 'Voz', description: mensaje, color: 'warning' })
      try {
        await tts.speak(mensaje)
      } catch {
        /* noop */
      }
      return
    }

    const r = await fiado.registrarDeudaDirecta({
      clienteId: cliente.id,
      ubicacion: ubi,
      lineas: [{
        productoId: fila.productoId,
        cantidad,
        precioVentaUsado: precio
      }]
    })
    if (!r?.ok) {
      estado.value = 'idle'
      throw new Error(r?.error?.message || 'No se pudo registrar la deuda.')
    }

    const confirmacionTexto = `Fiado a ${cliente.nombre}: ${cantidad} de ${fila.nombre}.`
    ultimaRespuestaVoz.value = confirmacionTexto
    toast.add({
      title: 'Fiado registrado',
      description: `${cantidad} de ${fila.nombre} a ${cliente.nombre} · ${importe} pesos`,
      color: 'success',
      duration: 8000
    })
    try {
      await tts.speak(`Fiado a ${cliente.nombre}.`)
    } catch {
      /* noop */
    }
    estado.value = 'idle'
    // El stock y el saldo del cliente cambiaron: la foto de la app cerrada se
    // reescribe para no responder con datos viejos.
    void snapshotVoz.actualizar().catch(() => {})
  }

  /**
   * Confirma y cobra una deuda. Reparte FIFO si hay varias y no escribe nada
   * hasta el «sí». Una corrección de importe («no, eran 150») se acepta dos veces.
   */
  async function prepararCobro(accion) {
    const cliente = accion?.cliente
    if (!cliente?.id || !accion?.pagos?.length) {
      estado.value = 'idle'
      throw new Error('Falta el cliente o la deuda para cobrar.')
    }

    let monto = Number(accion.monto) || 0
    let pagos = accion.pagos
    let restante = Number(accion.restante) || 0
    let frase = fraseCobro({ cliente: cliente.nombre, monto, restante })

    modo.value = 'cobro'
    estado.value = 'confirmando'
    ultimaRespuestaVoz.value = frase
    readBackTexto.value = frase
    readBackIncluyeConfirmacion.value = true
    toast.add({ title: 'Cobrar por voz', description: frase, color: 'success', duration: 8000 })

    if (!tts.habilitado.value) {
      estado.value = 'idle'
      toast.add({
        title: 'Voz',
        description: 'La lectura de voz está apagada: no se cobró nada.',
        color: 'warning'
      })
      return
    }

    let correcciones = 0
    let resultado = 'timeout'
    while (true) {
      const respuesta = await escucharRespuestaVoz(frase)
      resultado = respuesta.resultado
      if (resultado !== 'corregir') break

      if (correcciones >= 2) {
        resultado = 'abandonado'
        break
      }
      const nuevo = Math.trunc(Number(respuesta.cantidad) || 0)
      if (nuevo < 1 || nuevo > accion.saldoTotal) {
        resultado = 'monto_invalido'
        break
      }
      const reparto = distribuirCobro(accion.cuentas, nuevo)
      if (!reparto.pagos.length || reparto.sobrante > 0) {
        resultado = 'monto_invalido'
        break
      }
      monto = reparto.aplicado
      pagos = reparto.pagos
      restante = Math.round((accion.saldoTotal - monto) * 100) / 100
      frase = fraseCobro({ cliente: cliente.nombre, monto, restante })
      ultimaRespuestaVoz.value = frase
      readBackTexto.value = frase
      correcciones++
    }

    if (resultado !== 'afirmado') {
      estado.value = 'idle'
      const mensaje = resultado === 'negado'
        ? 'Cancelado.'
        : (resultado === 'monto_invalido'
            ? 'Ese monto no es válido. No se cobró nada.'
            : 'Sin respuesta. No se cobró nada.')
      toast.add({ title: 'Voz', description: mensaje, color: 'warning' })
      try {
        await tts.speak(mensaje)
      } catch {
        /* noop */
      }
      return
    }

    let cobrado = 0
    for (const pago of pagos) {
      const r = await fiado.cobrarDeuda({
        cuentaFiadoId: pago.cuentaId,
        monto: pago.monto,
        formaPago: accion.formaPago
      })
      if (!r?.ok) {
        estado.value = 'idle'
        const mensaje = cobrado > 0
          ? `Cobré ${cobrado} pesos a ${cliente.nombre}. El resto no se pudo cobrar.`
          : (r?.error?.message || 'No se pudo cobrar.')
        toast.add({ title: 'Cobro a medias', description: mensaje, color: 'warning' })
        try {
          await tts.speak(mensaje)
        } catch {
          /* noop */
        }
        void snapshotVoz.actualizar().catch(() => {})
        return
      }
      cobrado = Math.round((cobrado + pago.monto) * 100) / 100
    }

    const texto = restante > 0
      ? `Cobrado: ${cobrado} pesos a ${cliente.nombre}. Le quedan ${restante}.`
      : `Cobrado: ${cobrado} pesos a ${cliente.nombre}. Queda saldado.`
    ultimaRespuestaVoz.value = texto
    toast.add({
      title: 'Cobro registrado',
      description: texto,
      color: 'success',
      duration: 8000
    })
    try {
      await tts.speak(texto)
    } catch {
      /* noop */
    }
    estado.value = 'idle'
    void snapshotVoz.actualizar().catch(() => {})
  }

  /** Repite la última respuesta hablada (consultas de stock, precio o deuda). */
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
    const emparejar = crearEmparejador(catalogo, sttConfidence, alias.paraEmparejar.value)
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

  /**
   * Consulta de deudas SIN efectos: suma los saldos fiados del puesto y busca
   * al cliente nombrado. Solo con permiso de `/deudas`.
   */
  async function resolverConsultaDeuda(slots, sttConfidence = 0, vigente = () => true) {
    if (!perms.puedeVista('deudas')) {
      return {
        tipo: 'aviso',
        mensaje: 'No tienes permiso para consultar las deudas.',
        auditar: { comando: 'consulta_deuda', motivo: 'sin_permiso', confianza: Number(sttConfidence) || 0 }
      }
    }

    const puestoId = auth.usuarioActual.value?.puestoId
    if (!puestoId) {
      return {
        tipo: 'error',
        comando: 'consulta_deuda',
        motivo: 'sin_puesto',
        mensaje: 'No hay un puesto activo para consultar deudas.',
        texto: slots?.clienteHint || '',
        auditar: { comando: 'consulta_deuda', motivo: 'sin_puesto', confianza: Number(sttConfidence) || 0 }
      }
    }

    const [cuentas, clientes] = await Promise.all([
      fiado.cargarDeudas().catch(() => []),
      fiado.cargarClientes(puestoId, { incluirSinCliente: false, incluirInactivos: true }).catch(() => [])
    ])
    if (!vigente()) return { tipo: 'cancelado' }

    const resumen = resumirDeudas({ cuentas: cuentas ?? [], clientes: clientes ?? [] })
    const encontrado = buscarClienteDeuda(slots?.clienteHint ?? '', resumen)
    return {
      tipo: 'consultar_deuda',
      resumen,
      encontrado,
      ambito: slots?.ambito ?? 'total',
      slots,
      // Una deuda no encontrada es una respuesta, no un fallo: se audita para
      // saber qué nombres no emparejan, sin guardar el nombre.
      auditar: encontrado.tipo === 'inexistente' || encontrado.tipo === 'ambiguo'
        ? { comando: 'consulta_deuda', motivo: `deuda_${encontrado.tipo}`, confianza: Number(sttConfidence) || 0 }
        : null
    }
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
      if (!emparejadores.has(cat)) emparejadores.set(cat, crearEmparejador(cat, sttConfidence, alias.paraEmparejar.value))
      return emparejadores.get(cat)
    }
    for (const t of unicos) {
      const clas = interpretar(t, vozLexico.lexico.value)
      const rec = { indice: items.length, comando: clas.comando, elegido: false, ambiguo: true, efectivo: 0, encontrados: 0 }
      if (clas.comando === 'consulta_deuda' || clas.comando === 'consulta_dia' || clas.comando === 'consulta_ganancia'
        || clas.comando === 'consulta_caja' || clas.comando === 'cobro_deuda' || clas.comando === 'cuadre_accion'
        || clas.comando === 'repetir' || clas.comando === 'ayuda') {
        // No dependen de catálogo: no se evalúan contra el inventario.
        rec.elegido = true
      } else if (clas.comando === 'venta_directa' || clas.comando === 'venta_fiada'
        || clas.comando === 'consulta_stock' || clas.comando === 'consulta_precio'
        || clas.comando === 'entrada_inventario' || clas.comando === 'cambio_precio' || clas.comando === 'traspaso') {
        try {
          const esConsulta = clas.comando === 'consulta_stock' || clas.comando === 'consulta_precio'
          const esAsistido = clas.comando === 'entrada_inventario' || clas.comando === 'cambio_precio' || clas.comando === 'traspaso'
          const cat = esConsulta
            ? await catalogoDe('global', { soloVendibles: false })
            : esAsistido
              ? await catalogoDe('almacen', { soloVendibles: false })
              : await catalogoDe((clas.slots?.ubicacion) || ubicacion)
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
  async function resolver(texto, { sttConfidence = 0, alternativas = [], vigente = () => true, ventaDirecta = null } = {}) {
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

    if (comando === 'consulta_stock') return resolverConsultaStock(slots, sttConfidence, vigente)
    if (comando === 'consulta_precio') return resolverConsultaPrecio(slots, sttConfidence, vigente)
    if (comando === 'consulta_deuda') return resolverConsultaDeuda(slots, sttConfidence, vigente)
    if (comando === 'consulta_dia') return resolverConsultaDia(slots, sttConfidence)
    if (comando === 'consulta_ganancia') return resolverConsultaGanancia(slots, sttConfidence)
    if (comando === 'consulta_caja') return resolverConsultaCaja(slots, sttConfidence)
    if (comando === 'venta_fiada') return resolverFiadoAccion(slots, sttConfidence, vigente)
    if (comando === 'cobro_deuda') return resolverCobroAccion(slots, sttConfidence, vigente)
    // Comandos ASISTIDOS (K, L, M, N): no escriben, solo prellenan o navegan.
    // Con la app cerrada (buzón) no existen: necesitan el formulario delante.
    if (comando === 'entrada_inventario' || comando === 'cambio_precio' || comando === 'traspaso' || comando === 'cuadre_accion') {
      if (ventaDirecta === true) return { tipo: 'cancelado' }
    }
    if (comando === 'entrada_inventario') return resolverEntradaAccion(slots, sttConfidence, vigente)
    if (comando === 'cambio_precio') return resolverCambioPrecioAccion(slots, sttConfidence, vigente)
    if (comando === 'traspaso') return resolverTraspasoAccion(slots, sttConfidence, vigente)
    if (comando === 'cliente_alta') return resolverClienteAlta(slots, sttConfidence)
    if (comando === 'mover_producto') return resolverMoverAccion(slots, sttConfidence)
    if (comando === 'cuadre_accion') return resolverCuadreAccion(slots, sttConfidence)
    if (comando === 'repetir') return { tipo: 'repetir' }
    if (comando === 'ayuda') return { tipo: 'ayuda' }
    // venta_directa: primero se intenta la frase con varias líneas; si alguna
    // no resuelve sin dudas, cae al flujo de una sola línea.
    const multi = await resolverVentaMultiAccion(textoElegido, sttConfidence, vigente, { ventaDirecta })
    if (multi) return multi
    return resolverVentaAccion(slots, sttConfidence, vigente, { ventaDirecta })
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
          cliente: accion.cliente ?? null,
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
      case 'consultar_stock':
        return responderStock(accion.fila, accion.slots)
      case 'consultar_precio':
        return responderPrecio(accion.fila, accion.slots)
      case 'consultar_deuda':
        return responderDeuda(accion)
      case 'consultar_dia':
        return responderDia(accion)
      case 'consultar_ganancia':
        return responderGanancia(accion)
      case 'consultar_caja':
        return responderCaja()
      case 'repetir':
        return repetirUltimaRespuesta()
      case 'ayuda':
        return responderAyuda()
      case 'venta':
        // Siempre el formulario; la confirmación hablada la maneja el layout.
        return prepararVenta(accion.fila, accion.slots, accion.destino.ubicacion)
      case 'venta_multiple':
        return prepararVentaMultiple(accion)
      case 'fiar':
        return prepararFiado(accion)
      case 'cobrar':
        return prepararCobro(accion)
      case 'entrada':
        return prepararEntrada(accion)
      case 'cambio_precio':
        return prepararCambioPrecio(accion)
      case 'traspaso':
        return prepararTraspaso(accion)
      case 'cliente_alta':
        return prepararClienteAlta(accion)
      case 'mover':
        accionSinFormulario.value = {
          texto: accion.texto,
          aplicar: async () => {
            try {
              const r = await inv.moverProducto(accion.fila.id, accion.indice)
              toast.add({
                title: 'Catálogo',
                description: `${accion.fila.nombre} quedó en la posición ${r.posicion} de ${r.total}.`,
                color: 'success'
              })
              invalidarCatalogoVoz()
            } catch (e) {
              toast.add({ title: 'Catálogo', description: e?.message || 'No se pudo mover.', color: 'error' })
            }
          }
        }
        estado.value = 'idle'
        return
      case 'cuadre':
        return ejecutarCuadre(accion, vigente)
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

  /**
   * Aprende el alias cuando el jefe eligió el producto a mano. Es el único
   * momento con señal clara; el alias solo acelera la próxima vez y se puede
   * deshacer desde el propio aviso.
   */
  async function aprenderAlias(textoDicho, fila) {
    if (!fila?.productoId) return
    const filaAlias = await alias.aprender({
      texto: textoDicho,
      productoId: fila.productoId,
      productoNombre: fila.nombre
    }).catch(() => null)
    if (!filaAlias || filaAlias.repetido) return
    toast.add({
      title: 'Alias aprendido',
      description: `«${filaAlias.texto}» → ${fila.nombre}`,
      color: 'neutral',
      duration: 10000,
      actions: [{
        label: 'Deshacer',
        onClick: () => { void alias.deshacer(filaAlias.id) }
      }]
    })
  }

  async function seleccionarCandidato(candidato) {
    const datos = pendiente.value
    showCandidatos.value = false
    pendiente.value = null
    if (!candidato?.row || !datos) return
    // La elección explícita es la señal para aprender el alias.
    await aprenderAlias(datos.slots?.productoHint, candidato.row)
    if (datos.comando === 'consulta_stock') {
      await responderStock(candidato.row, datos.slots)
      return
    }
    if (datos.comando === 'consulta_precio') {
      await responderPrecio(candidato.row, datos.slots)
      return
    }
    if (datos.comando === 'venta_fiada') {
      await fiarCandidato(candidato, datos)
      return
    }
    if (datos.comando === 'entrada_inventario') {
      await procesarCandidatoAsistido(candidato, datos, 'entrada_inventario')
      return
    }
    if (datos.comando === 'cambio_precio') {
      await procesarCandidatoAsistido(candidato, datos, 'cambio_precio')
      return
    }
    if (datos.comando === 'traspaso') {
      await procesarCandidatoAsistido(candidato, datos, 'traspaso')
      return
    }
    prepararVenta(candidato.row, datos.slots, datos.slots?.ubicacion || undefined)
  }

  /**
   * Tras elegir el producto a mano en un comando asistido, se prepara el
   * formulario con la misma cantidad/precio ya dictados.
   */
  async function procesarCandidatoAsistido(candidato, datos, comando) {
    const slots = datos.slots ?? {}
    if (comando === 'entrada_inventario') {
      return prepararEntrada({
        fila: candidato.row,
        cantidad: Math.max(1, Math.trunc(Number(slots.cantidad) || 1)),
        precioUnitario: Number(slots.precioUnitario) > 0 ? Number(slots.precioUnitario) : null
      })
    }
    if (comando === 'cambio_precio') {
      const precio = Number(slots.precio)
      if (!(precio > 0)) {
        return prepararCambioPrecio({ fila: candidato.row, precioActual: Number(candidato.row?.precioVentaActual ?? 0), precio: null })
      }
      return prepararCambioPrecio({ fila: candidato.row, precioActual: Number(candidato.row?.precioVentaActual ?? 0), precio })
    }
    return prepararTraspaso({
      fila: candidato.row,
      cantidad: Math.max(1, Math.trunc(Number(slots.cantidad) || 1))
    })
  }

  const tituloCandidatos = computed(() => {
    const comando = pendiente.value?.comando
    if (comando === 'consulta_stock') return 'Confirma qué producto consultar'
    if (comando === 'consulta_precio') return 'Confirma de qué producto quieres el precio'
    if (comando === 'venta_fiada') return 'Confirma qué producto fiar'
    if (comando === 'entrada_inventario') return 'Confirma qué producto entró'
    if (comando === 'cambio_precio') return 'Confirma de qué producto cambiar el precio'
    if (comando === 'traspaso') return 'Confirma qué producto traspasar'
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
    accionSinFormulario,
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
