import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { mensajeStt } from '../utils/voice/stt'
import {
  hayInternet,
  ultimaSonda,
  cargarEstadoConectividad,
  esperarInternet
} from '../composables/useConectividad'
import { MOTORES, OPCIONES_MOTOR, resolverSeleccion } from '../utils/voice/engines'
import { IDIOMAS_VOZ, etiquetaIdioma, resolverIdioma } from '../utils/voice/idioma'
import { avanzarFaseStt } from '../utils/voice/faseVoz'
import {
  MS_RESCATE,
  MS_SIN_VOZ,
  MS_TEXTO_ESTABLE,
  decidirVigilancia
} from '../utils/voice/vigilancia'
import {
  formatearEntrada,
  formatearResumen,
  formatearTraza,
  fusionarTrazas,
  resumirTraza
} from '../utils/voice/diagnostico'

const PREFERENCIAS_MOTOR = new Set(['automatico', ...OPCIONES_MOTOR.map(opcion => opcion.id)])
const GOOGLE_PLUGIN = MOTORES.find(motor => motor.id === 'google')?.plugin
const IDIOMAS_VALIDOS = new Set(IDIOMAS_VOZ.map(opcion => opcion.id))

// Tiempo máximo SIN actividad del reconocedor dentro de un intento. Se reinicia
// con cada `start`/`ready`/`partial` nativo, así que ya no corta una frase a
// mitad: solo actúa si el motor se queda colgado de verdad.
const INTENTO_TIMEOUT_MS = 20_000
// Tope absoluto de una escucha completa (incluye reintentos del plugin).
const MAX_ESCUCHA_MS = 45_000
// Cuánto dura el resaltado «Te escucho» después de un cambio de texto.
const TEXTO_RECIENTE_MS = 1500
const MAX_TRAZA = 2000
const KEY_TRAZA = 'voz.diagnostico'
// Escritura síncrona en localStorage: sobrevive a recargas y a que Android
// mate la app, aunque el guardado asíncrono en Preferences no llegue.
const KEY_TRAZA_LOCAL = 'voz.diagnostico.local'
const PERSISTIR_CADA_MS = 1500
const PREF_MOTOR_VOZ = 'voz.motor'
const PREF_IDIOMA_VOZ = 'voz.idioma'

function esCancelacion(mensaje) {
  return String(mensaje ?? '').toLowerCase().includes('cancel')
}

function _useVoiceCommand() {
  const auth = useAuth()
  const estado = ref('idle')
  const transcript = ref('')
  const transcriptParcial = ref('')
  const confidence = ref(0)
  const alternativas = ref([])
  const error = ref(null)
  // true cuando el micrófono ya está capturando de verdad (no solo "pedido").
  // La UI lo usa para decir "Habla ahora" en el momento exacto.
  const microListo = ref(false)
  // Fase visible del STT dentro de la escucha actual:
  //   preparando → capturando → procesando. Solo avanza, nunca retrocede
  // (el churn `end`/`beginning` del motor offline no la mueve).
  const faseStt = ref('idle')
  // Hubo un cambio de texto reconocido hace menos de TEXTO_RECIENTE_MS. Es la
  // señal real de "te estoy entendiendo"; el nivel de audio solo apoya.
  const textoReciente = ref(false)
  let instanciaWeb = null
  // Reloj por intento del reconocedor nativo. Se reinicia con cada evento del
  // motor, así que solo dispara si el intento se queda realmente colgado.
  let relojIntento = null
  let topeEscucha = null
  let cancelarIntento = null
  // Resolución del intento en curso, para el rescate con el último parcial.
  let resolverIntento = null
  let rechazarIntento = null
  // Vigilantes de la escucha (ver utils/voice/vigilancia.js).
  let vigilanteTexto = null
  let vigilanteReciente = null
  let vigilanteSinVoz = null
  let vigilanteRescate = null
  let finalizando = false
  let ultimoTextoVigilado = ''
  let ultimoParcialTraza = null
  let inicioReady = 0
  let ultimoCambioTexto = 0
  // Firma del último evento nativo registrado (D: traza sin duplicados).
  let firmaNativaPrevia = ''
  // Plugin nativo activo en la escucha actual (Google o Vosk). stopListening
  // lo necesita para detener el motor correcto.
  let pluginActivo = null

  // Preferencia de motor de voz guardada en Ajustes: 'google' | 'vosk' | 'automatico'.
  const preferenciaMotor = ref('automatico')

  async function cargarPreferenciaMotor() {
    try {
      const { value } = await Preferences.get({ key: PREF_MOTOR_VOZ })
      if (PREFERENCIAS_MOTOR.has(value)) {
        preferenciaMotor.value = value
      }
    } catch {
      preferenciaMotor.value = 'automatico'
    }
  }
  async function guardarPreferenciaMotor(valor) {
    if (!PREFERENCIAS_MOTOR.has(valor)) return
    preferenciaMotor.value = valor
    try {
      await Preferences.set({ key: PREF_MOTOR_VOZ, value: valor })
    } catch {}
  }

  // Selección resuelta: motor + modo (online/offline) según Ajustes y conexión.
  const seleccionMotor = computed(() => resolverSeleccion(preferenciaMotor.value, hayInternet.value))
  const modoActual = computed(() => (seleccionMotor.value?.offline ? 'offline' : 'online'))

  /**
   * Devuelve el plugin a usar para la escucha actual.
   * Se mantiene por compatibilidad; el flujo real usa `seleccionMotor`.
   */
  function pluginParaMotor() {
    return seleccionMotor.value?.plugin || null
  }

  /** Nombre legible del motor activo para mostrar en la UI. */
  const nombreMotor = computed(() => {
    return seleccionMotor.value?.opcion?.label || seleccionMotor.value?.label || null
  })

  // Idioma del reconocimiento: 'sistema' | 'es-US' | 'es-ES' | 'es-419'.
  // `sistema` deja que Android use su locale (el mismo del teclado); si el
  // sistema no está en español, se usa es-US para no transcribir en inglés.
  const preferenciaIdioma = ref('sistema')
  const idiomaSistema = computed(() => {
    if (typeof navigator === 'undefined') return 'es-US'
    return navigator.language || 'es-US'
  })
  const idiomaEfectivo = computed(() => resolverIdioma(preferenciaIdioma.value, idiomaSistema.value))
  const idiomaEtiqueta = computed(() => etiquetaIdioma(preferenciaIdioma.value, idiomaEfectivo.value, idiomaSistema.value))
  const idiomaWeb = computed(() => {
    if (idiomaEfectivo.value) return idiomaEfectivo.value
    const sistema = String(idiomaSistema.value || '').toLowerCase()
    return sistema.startsWith('es') ? idiomaSistema.value : 'es-US'
  })
  const idiomaTexto = computed(() => idiomaEfectivo.value || `sistema:${idiomaSistema.value}`)

  async function cargarPreferenciaIdioma() {
    try {
      const { value } = await Preferences.get({ key: PREF_IDIOMA_VOZ })
      if (IDIOMAS_VALIDOS.has(value)) {
        preferenciaIdioma.value = value
      }
    } catch {
      preferenciaIdioma.value = 'sistema'
    }
  }
  async function guardarPreferenciaIdioma(valor) {
    if (!IDIOMAS_VALIDOS.has(valor)) return
    preferenciaIdioma.value = valor
    try {
      await Preferences.set({ key: PREF_IDIOMA_VOZ, value: valor })
    } catch {}
  }
  const esNativo = computed(() => {
    try {
      return Capacitor.isNativePlatform()
    } catch {
      return false
    }
  })
  const SpeechRecognitionCtor = computed(() => {
    if (typeof window === 'undefined') return null
    return window.SpeechRecognition || window.webkitSpeechRecognition || null
  })
  const esContextoSeguro = computed(() => {
    try {
      if (typeof window === 'undefined') return true
      if (typeof window.isSecureContext === 'boolean') return window.isSecureContext
      return true
    } catch {
      return true
    }
  })
  const esWebSoportado = computed(() => Boolean(SpeechRecognitionCtor.value) && esContextoSeguro.value)
  const backend = computed(() => {
    if (esNativo.value) return 'native'
    if (esWebSoportado.value) return 'web'
    return null
  })
  const disponible = computed(() => backend.value !== null)
  const isListening = computed(() => estado.value === 'listening')

  // En Android nativo, SpeechRecognizer usa paquetes de idioma instalados
  // localmente, así que si el motor está disponible, el STT funciona offline.
  const sttOfflineDisponible = computed(() => esNativo.value && nativoDisponible.value === true)

  const nativoDisponible = ref(null)
  const permisoMicrofono = ref(false)
  // Diagnóstico del motor de reconocimiento (solo Android nativo).
  const motorStt = ref('')
  const onDeviceStt = ref(false)
  const serviciosStt = ref([])
  // Motor de voz elegido para la escucha en curso: 'google' | 'vosk' | 'web' | null.
  const motorVoz = ref(null)
  // Código nativo del último error (p. ej. "13"), para mostrarlo en la UI.
  const codigoError = ref(null)
  // Carga del modelo Vosk (solo Android nativo). Se muestra en la UI para que
  // el usuario no piense que la app está congelada durante los ~30 s de carga.
  const cargandoModelo = ref(false)

  // Conexión real a Internet (no solo interfaz WiFi/datos). Se inicializa al
  // arrancar y se reevalúa al cambiar la red.
  let hayInternetLista = false

  function asegurarConectividad() {
    if (!hayInternetLista && typeof cargarEstadoConectividad === 'function') {
      hayInternetLista = true
      void cargarEstadoConectividad()
    }
  }

  // --- Diagnóstico (solo local, nunca se sube al servidor) -----------------
  // La traza se graba SIEMPRE. Antes había que pulsar "Iniciar" y si la prueba
  // ocurría fuera de esa ventana no quedaba nada; ahora no depende del usuario.
  const trazaActiva = ref(true)
  const traza = ref([])
  const ultimoEvento = ref(null)
  let contextoInicio = null
  let ultimaPersistencia = 0
  const instanciaId = `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

  function leerTrazaLocal() {
    try {
      if (typeof localStorage === 'undefined') return []
      const crudo = localStorage.getItem(KEY_TRAZA_LOCAL)
      if (!crudo) return []
      const datos = JSON.parse(crudo)
      return Array.isArray(datos) ? datos : []
    } catch {
      return []
    }
  }

  function volcarTrazaLocal() {
    try {
      if (typeof localStorage === 'undefined') return
      localStorage.setItem(KEY_TRAZA_LOCAL, JSON.stringify(traza.value.slice(-MAX_TRAZA)))
    } catch {
      /* noop */
    }
  }

  function registrar(evento, datos = {}) {
    const t = Number(datos?.t) || Date.now()
    const inst = datos?.inst || instanciaId
    const entrada = { t, evento, inst }
    if (contextoInicio) {
      entrada.modo = contextoInicio.modo
      entrada.red = contextoInicio.red
    }
    for (const [clave, valor] of Object.entries(datos || {})) {
      if (clave === 't' || clave === 'inst' || valor === undefined) continue
      entrada[clave] = valor
    }
    // D: los motores nativos repiten el mismo evento en ráfaga (sobre todo el
    // churn `end`/`beginning`). Se deduplica la traza, no la lógica.
    if (inst === 'native') {
      const sinTiempo = { ...entrada }
      delete sinTiempo.t
      const firma = JSON.stringify(sinTiempo)
      if (firma === firmaNativaPrevia) return
      firmaNativaPrevia = firma
    } else {
      firmaNativaPrevia = ''
    }
    traza.value.push(entrada)
    if (traza.value.length > MAX_TRAZA) {
      traza.value.splice(0, traza.value.length - MAX_TRAZA)
    }
    ultimoEvento.value = entrada
    const ahora = Date.now()
    // Escritura síncrona (barata) para no perder la prueba si la app muere.
    if (ahora - ultimaPersistencia >= PERSISTIR_CADA_MS || /\.(error|rescue|result|fin|listo)$/.test(evento)) {
      ultimaPersistencia = ahora
      volcarTrazaLocal()
      void persistirTraza()
    }
    try {
      console.log('[VOZDIAG]', formatearEntrada(entrada))
    } catch {
      /* noop */
    }
  }

  /** Marca el cambio de texto y enciende «Te escucho» durante 1,5 s. */
  function marcarTextoReciente() {
    textoReciente.value = true
    if (vigilanteReciente) clearTimeout(vigilanteReciente)
    vigilanteReciente = setTimeout(() => {
      vigilanteReciente = null
      textoReciente.value = false
    }, TEXTO_RECIENTE_MS)
  }

  /**
   * Actualiza el parcial y reinicia el vigilante de silencio. Solo cuenta si
   * el texto cambió: los parciales repetidos no deben posponer el cierre.
   */
  function marcarParcial(textoCrudo) {
    const crudo = String(textoCrudo ?? '')
    const limpio = crudo.trim()
    if (!limpio || limpio === ultimoTextoVigilado) return
    ultimoTextoVigilado = limpio
    ultimoCambioTexto = Date.now()
    transcriptParcial.value = crudo
    marcarTextoReciente()
    if (vigilanteSinVoz) {
      clearTimeout(vigilanteSinVoz)
      vigilanteSinVoz = null
    }
    if (estado.value === 'listening') reiniciarVigilanteTexto()
  }

  /** Si hay texto y deja de cambiar, pedir el resultado al motor. */
  function reiniciarVigilanteTexto() {
    if (vigilanteTexto) clearTimeout(vigilanteTexto)
    vigilanteTexto = setTimeout(() => {
      vigilanteTexto = null
      evaluarVigilancia()
    }, MS_TEXTO_ESTABLE + 60)
  }

  /** Tope sin una sola palabra: cerrar en vez de esperar 45 s. */
  function armarVigilanteSinVoz() {
    if (vigilanteSinVoz) clearTimeout(vigilanteSinVoz)
    if (ultimoTextoVigilado) return
    vigilanteSinVoz = setTimeout(() => {
      vigilanteSinVoz = null
      evaluarVigilancia()
    }, MS_SIN_VOZ + 60)
  }

  function evaluarVigilancia() {
    if (estado.value !== 'listening' || !pluginActivo) return
    const ahora = Date.now()
    const accion = decidirVigilancia({
      desdeReadyMs: inicioReady ? ahora - inicioReady : null,
      desdeTextoMs: ultimoCambioTexto ? ahora - ultimoCambioTexto : null,
      hayTexto: Boolean(ultimoTextoVigilado),
      finalizando
    })
    if (accion === 'terminar' || accion === 'sin_voz') {
      pedirFinal(accion)
    }
  }

  /**
   * Cierra la escucha para consumir el resultado. `finish()` hace que Google
   * offline y Vosk llamen a `onResults` (probado: 78 ms en el APK). Si no
   * responden en MS_RESCATE, se resuelve con el último parcial.
   */
  function pedirFinal(motivo) {
    if (finalizando) return
    finalizando = true
    faseStt.value = avanzarFaseStt(faseStt.value, 'procesando')
    microListo.value = false
    if (relojIntento) {
      clearTimeout(relojIntento)
      relojIntento = null
    }
    if (topeEscucha) {
      clearTimeout(topeEscucha)
      topeEscucha = null
    }
    if (vigilanteTexto) {
      clearTimeout(vigilanteTexto)
      vigilanteTexto = null
    }
    if (vigilanteSinVoz) {
      clearTimeout(vigilanteSinVoz)
      vigilanteSinVoz = null
    }
    registrar('stt.fin', { motivo, texto: ultimoTextoVigilado })
    if (!pluginActivo) return // web: el cierre lo hace SpeechRecognition
    try {
      const p = pluginActivo.finish?.()
      if (p && typeof p.catch === 'function') p.catch(() => {})
    } catch {
      /* el plugin pudo terminar solo */
    }
    if (vigilanteRescate) clearTimeout(vigilanteRescate)
    vigilanteRescate = setTimeout(() => {
      vigilanteRescate = null
      const rescate = ultimoTextoVigilado
      const resolver = resolverIntento
      const rechazar = rechazarIntento
      resolverIntento = null
      rechazarIntento = null
      if (rescate) {
        registrar('stt.rescate_js', { texto: rescate, motivo: 'sin_resultado' })
        resolver?.({ text: rescate, confidence: 0.8, alternativas: [{ text: rescate, confidence: 0.8 }] })
      } else {
        registrar('stt.sin_resultado', { motivo, ms: MS_RESCATE })
        rechazar?.(new Error(motivo === 'sin_voz' ? 'speech_timeout' : 'no_match'))
      }
    }, MS_RESCATE)
  }

  function limpiarVigilantes() {
    if (vigilanteTexto) {
      clearTimeout(vigilanteTexto)
      vigilanteTexto = null
    }
    if (vigilanteReciente) {
      clearTimeout(vigilanteReciente)
      vigilanteReciente = null
    }
    if (vigilanteSinVoz) {
      clearTimeout(vigilanteSinVoz)
      vigilanteSinVoz = null
    }
    if (vigilanteRescate) {
      clearTimeout(vigilanteRescate)
      vigilanteRescate = null
    }
    finalizando = false
    resolverIntento = null
    rechazarIntento = null
    inicioReady = 0
    ultimoCambioTexto = 0
    ultimoTextoVigilado = ''
    ultimoParcialTraza = null
    textoReciente.value = false
  }

  /**
   * Procesa un evento `sttEvent` del motor activo (Google global o Vosk por
   * escucha). Centraliza la actualización del parcial, la fase y el micrófono.
   */
  function procesarEventoStt(nombre, resto = {}) {
    // Mientras se cierra, el motor offline sigue emitiendo `beginning`/`end`:
    // no toca la UI (era la causa del parpadeo «Habla ahora / Te escucho»).
    if (finalizando && (nombre === 'beginning' || nombre === 'end' || nombre === 'ready')) {
      return
    }
    const crudo = typeof resto?.texto === 'string' ? resto.texto : ''
    const escuchando = estado.value === 'listening'
    if (nombre === 'partial') {
      // Un parcial idéntico no aporta nada y ensuciaba la traza.
      if (crudo === ultimoParcialTraza) return
      ultimoParcialTraza = crudo
      if (escuchando) marcarParcial(crudo)
      reiniciarRelojIntento()
    } else if (nombre === 'ready') {
      if (escuchando) {
        microListo.value = true
        faseStt.value = avanzarFaseStt(faseStt.value, 'capturando')
        inicioReady = Date.now()
        armarVigilanteSinVoz()
      }
    } else if (nombre === 'beginning') {
      if (escuchando) {
        microListo.value = true
        faseStt.value = avanzarFaseStt(faseStt.value, 'capturando')
      }
    } else if (nombre === 'finish') {
      if (escuchando) faseStt.value = avanzarFaseStt(faseStt.value, 'procesando')
    } else if (nombre === 'error' || nombre === 'stop') {
      microListo.value = false
    }
    if (nombre === 'start' || nombre === 'ready' || nombre === 'beginning'
      || nombre === 'partial' || nombre === 'end') {
      reiniciarRelojIntento()
    }
    registrar(`stt.${nombre}`, { ...resto, inst: 'native' })
  }

  async function persistirTraza() {
    try {
      await Preferences.set({
        key: KEY_TRAZA,
        value: JSON.stringify(traza.value.slice(-MAX_TRAZA))
      })
    } catch {
      /* noop */
    }
  }

  /** Fusiona lo guardado (localStorage y Preferences) con lo que hay en memoria. */
  async function cargarTrazaGuardada() {
    let guardada = leerTrazaLocal()
    try {
      const { value } = await Preferences.get({ key: KEY_TRAZA })
      if (value) {
        const dePrefs = JSON.parse(value)
        if (Array.isArray(dePrefs)) guardada = [...guardada, ...dePrefs]
      }
    } catch {
      /* noop */
    }
    if (!guardada.length) return
    traza.value = fusionarTrazas(traza.value, guardada, MAX_TRAZA)
  }

  /** Relee lo persistido: sirve tras Sync nativo o al abrir Ajustes. */
  async function refrescarTraza() {
    await cargarTrazaGuardada()
  }

  /**
   * Vuelca el buffer propio del plugin nativo y lo fusiona con la traza JS.
   * Es la red de seguridad: aunque `notifyListeners` falle, el plugin guarda
   * sus últimos eventos y aquí se recuperan.
   */
  async function sincronizarDiagNativo() {
    if (!esNativo.value || typeof GOOGLE_PLUGIN?.diag !== 'function') return
    try {
      const r = await GOOGLE_PLUGIN.diag()
      const eventos = Array.isArray(r?.eventos) ? r.eventos : []
      if (!eventos.length) return
      const normalizados = eventos.map(e => ({
        ...e,
        evento: String(e.evento || e.event || '').startsWith('stt.')
          ? String(e.evento || e.event)
          : `stt.${e.evento || e.event || 'evento'}`,
        inst: e.inst || 'native'
      }))
      traza.value = fusionarTrazas(traza.value, normalizados, MAX_TRAZA)
      volcarTrazaLocal()
    } catch {
      /* noop */
    }
  }

  /** Marca el inicio de una ronda de pruebas: limpia y anota el contexto. */
  async function iniciarTraza(contexto = {}) {
    traza.value = []
    contextoInicio = {
      modo: contexto?.modo ?? null,
      red: contexto?.red ?? null
    }
    trazaActiva.value = true
    volcarTrazaLocal()
    const r = await check()
    registrar('diag.inicio', {
      backend: backend.value,
      sdk: r?.sdk ?? null,
      servicio: r?.service || '',
      onDevice: r?.onDevice ?? null,
      servicios: Array.isArray(r?.services) ? r.services.length : null,
      permiso: r?.permission ?? null
    })
    await sincronizarDiagNativo()
  }

  /** Cierra la ronda: la traza sigue grabándose igualmente. */
  async function detenerTraza() {
    registrar('diag.fin', { lineas: traza.value.length })
    await sincronizarDiagNativo()
    volcarTrazaLocal()
    await persistirTraza()
  }

  function limpiarTraza() {
    traza.value = []
    ultimoEvento.value = null
    volcarTrazaLocal()
    void persistirTraza()
  }

  const textoTraza = computed(() => formatearTraza(traza.value))
  const resumenTraza = computed(() => resumirTraza(traza.value))
  const textoResumenTraza = computed(() => formatearResumen(resumenTraza.value))
  async function check() {
    if (!esNativo.value) return null
    try {
      const r = await GOOGLE_PLUGIN.check()
      nativoDisponible.value = Boolean(r?.available)
      permisoMicrofono.value = Boolean(r?.permission)
      motorStt.value = String(r?.service || '')
      onDeviceStt.value = Boolean(r?.onDevice)
      serviciosStt.value = Array.isArray(r?.services) ? r.services.map(String) : []
      return r
    } catch {
      nativoDisponible.value = false
      permisoMicrofono.value = false
      motorStt.value = ''
      onDeviceStt.value = false
      serviciosStt.value = []
      return null
    }
  }
  async function pedirPermisoMicrofono() {
    if (!esNativo.value) return true
    try {
      const r = await GOOGLE_PLUGIN.requestPermission()
      const ok = !r || r.ok !== false
      await check()
      return ok
    } catch {
      await check()
      return false
    }
  }

  async function startListening(options = {}) {
    if (estado.value === 'listening') return
    if (options?.contexto) {
      contextoInicio = {
        modo: options.contexto.modo ?? contextoInicio?.modo ?? null,
        red: options.contexto.red ?? contextoInicio?.red ?? null
      }
    }
    const idioma = idiomaEfectivo.value
    registrar('stt.begin', {
      idioma: idiomaTexto.value,
      offline: options?.offline ?? null,
      backend: backend.value,
      microListo: microListo.value
    })
    // Motivo exacto de la última medición de red: sin esto, un «sin red» en el
    // APK no dice si fue timeout, rechazo del fetch o red caída.
    if (ultimaSonda.value) {
      registrar('red.sonda', { ...ultimaSonda.value, internet: hayInternet.value })
    }
    estado.value = 'listening'
    microListo.value = false
    limpiarVigilantes()
    faseStt.value = 'preparando'
    firmaNativaPrevia = ''
    transcript.value = ''
    transcriptParcial.value = ''
    confidence.value = 0
    error.value = null
    codigoError.value = null
    alternativas.value = []

    if (!esNativo.value) {
      if (!esWebSoportado.value) {
        error.value = 'El reconocimiento de voz solo está disponible en la app Android o en navegadores compatibles (Chrome/Edge en HTTPS).'
        estado.value = 'error'
        return
      }
      let rec = null
      let timer = null
      auth.registrarActividad()
      try {
        const resultado = await new Promise((resolve, reject) => {
          try {
            const Ctor = SpeechRecognitionCtor.value
            rec = new Ctor()
            instanciaWeb = rec
          } catch (e) {
            reject(e)
            return
          }
          rec.lang = idiomaWeb.value
          rec.interimResults = true
          rec.maxAlternatives = 5
          rec.continuous = false
          rec.onaudiostart = () => {
            microListo.value = true
            faseStt.value = avanzarFaseStt(faseStt.value, 'capturando')
          }
          timer = setTimeout(() => {
            if (timer) {
              const id = timer
              timer = null
              clearTimeout(id)
            }
            try {
              rec?.stop()
            } catch {
              // ignore
            }
            reject(new Error('timeout'))
          }, MAX_ESCUCHA_MS)
          rec.onresult = (event) => {
            const lista = event?.results
            const actual = lista?.[lista.length - 1]
            if (!actual) return
            const txt = actual?.[0]?.transcript ?? ''
            transcriptParcial.value = txt
            if (txt.trim() && txt.trim() !== ultimoTextoVigilado) {
              ultimoTextoVigilado = txt.trim()
              marcarTextoReciente()
            }
            if (actual.isFinal) {
              faseStt.value = avanzarFaseStt(faseStt.value, 'procesando')
              if (timer) {
                clearTimeout(timer)
                timer = null
              }
              const alternativas = []
              for (let i = 0; i < actual.length; i++) {
                alternativas.push({ texto: actual[i]?.transcript ?? '', confianza: Number(actual[i]?.confidence) || 0 })
              }
              resolve({ text: txt, confidence: Number(actual?.[0]?.confidence) || 0, alternativas })
            }
          }
          rec.onerror = (event) => {
            if (timer) {
              clearTimeout(timer)
              timer = null
            }
            const code = event?.error || 'unknown'
            if (code === 'no-speech') reject(new Error('speech_timeout'))
            else if (code === 'aborted') reject(new Error('cancelled'))
            else if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'audio-capture') reject(new Error('insufficient_permissions'))
            else if (code === 'network') reject(new Error('error_network'))
            else reject(new Error(code))
          }
          rec.onend = () => {
            if (timer) {
              clearTimeout(timer)
              timer = null
              resolve({ text: '', confidence: 0 })
            }
          }
          try {
            rec.start()
          } catch (e) {
            if (timer) {
              clearTimeout(timer)
              timer = null
            }
            reject(e)
          }
        })
        if (resultado?.cancelled) {
          estado.value = 'cancelled'
          return
        }
        transcript.value = resultado.text ?? ''
        transcriptParcial.value = transcript.value
        confidence.value = Number(resultado.confidence) || 0
        alternativas.value = Array.isArray(resultado.alternativas)
          ? resultado.alternativas.map(a => ({ texto: a?.texto ?? a?.text ?? '', confianza: Number(a?.confianza ?? a?.confidence) || 0 }))
          : []
        estado.value = 'ready'
        registrar('stt.listo', {
          backend: 'web',
          texto: transcript.value,
          confidence: confidence.value,
          alternativas: alternativas.value.length
        })
      } catch (e) {
        const detalle = e?.message || 'Error desconocido'
        instanciaWeb = null
        codigoError.value = e?.code != null ? String(e.code) : null
        registrar('stt.error_js', {
          backend: 'web',
          detalle,
          code: codigoError.value,
          parcial: transcriptParcial.value || ''
        })
        if (esCancelacion(detalle)) estado.value = 'cancelled'
        else {
          error.value = mensajeStt(detalle)
          estado.value = 'error'
        }
      } finally {
        if (timer) clearTimeout(timer)
        try {
          rec?.stop()
        } catch {
          // ignore
        }
        instanciaWeb = null
        microListo.value = false
        faseStt.value = 'idle'
        limpiarVigilantes()
      }
      return
    }

    // El modo automático decide online/offline según Internet real. El dato se
    // reutiliza si es reciente (< 30 s); si no, se sondea antes de elegir.
    // Con un motor explícito (Google online/offline, Vosk) el modo ya está
    // fijado: esperar aquí solo retrasaría el micrófono.
    if (preferenciaMotor.value === 'automatico') {
      await esperarInternet()
      if (contextoInicio) contextoInicio.red = hayInternet.value
    }
    const seleccion = resolverSeleccion(preferenciaMotor.value, hayInternet.value)
    if (!seleccion?.plugin) {
      error.value = 'No hay un motor de voz disponible.'
      estado.value = 'error'
      return
    }
    const plugin = seleccion.plugin
    motorVoz.value = seleccion.id
    pluginActivo = plugin
    registrar('stt.begin', {
      idioma: idiomaTexto.value,
      offline: seleccion.offline,
      motor: seleccion.id,
      modo: seleccion.offline ? 'offline' : 'online',
      opcion: seleccion.opcion?.id ?? null,
      backend: backend.value,
      microListo: microListo.value
    })
    let nativePartial = null
    let nativeReady = null
    let nativeStt = null
    let timerMicroListo = null
    try {
      auth.registrarActividad()
      const permiso = await plugin.requestPermission()
      if (permiso && permiso.ok === false) throw new Error('insufficient_permissions')
      // Vosk (y cualquier motor futuro con modelo) carga antes de start.
      // No se comprueba `typeof plugin.preparar`: el Proxy de Capacitor
      // devuelve una función aunque el plugin nativo no la implemente.
      // El catálogo declara `preparar: true` solo en los motores que lo usan.
      if (seleccion.requierePreparacion) {
        cargandoModelo.value = true
        try {
          await plugin.preparar()
        } catch (e) {
          throw new Error(`${seleccion.id}_no_listo: ${e?.message || 'no se pudo preparar el motor'}`)
        } finally {
          cargandoModelo.value = false
        }
      }
      // Ambos plugins emiten sttEvent (start/ready/partial/result/error/stop/finish).
      // VoiceRecognitionNative además expone partialResult y ready como eventos
      // propios; VoskVoice solo usa sttEvent. Escuchamos ambos para no perder
      // parciales en ningún motor.
      if (plugin.addListener) {
        nativePartial = await plugin.addListener('partialResult', (d) => {
          marcarParcial(d?.text)
          reiniciarRelojIntento()
        })
      }
      if (plugin.addListener) {
        nativeReady = await plugin.addListener('ready', () => {
          if (estado.value !== 'listening') return
          microListo.value = true
          faseStt.value = avanzarFaseStt(faseStt.value, 'capturando')
          inicioReady = Date.now()
          armarVigilanteSinVoz()
          reiniciarRelojIntento()
        })
      }
      // Google ya tiene listener global; Vosk/futuros solo durante su escucha.
      if (!seleccion.eventoGlobal && plugin.addListener) {
        nativeStt = await plugin.addListener('sttEvent', (data = {}) => {
          const { event, ...resto } = data
          procesarEventoStt(event || 'evento', resto)
        })
      }
      // Fallback de UI: si el evento `ready` no llega, a los 1200 ms el motor
      // ya está capturando. También arma el tope sin voz.
      timerMicroListo = setTimeout(() => {
        timerMicroListo = null
        if (estado.value !== 'listening' || finalizando) return
        microListo.value = true
        faseStt.value = avanzarFaseStt(faseStt.value, 'capturando')
        if (!inicioReady) inicioReady = Date.now()
        armarVigilanteSinVoz()
      }, 1200)
      const resultado = await new Promise((resolver, rechazar) => {
        cancelarIntento = rechazar
        resolverIntento = resolver
        rechazarIntento = rechazar
        finalizando = false
        ultimoTextoVigilado = ''
        ultimoParcialTraza = null
        faseStt.value = 'preparando'
        // Tope absoluto de la escucha completa (incluye los reintentos del plugin).
        topeEscucha = setTimeout(() => {
          topeEscucha = null
          const cancelar = cancelarIntento
          cancelarIntento = null
          registrar('stt.timeout', { ms: MAX_ESCUCHA_MS, tope: true, microListo: microListo.value })
          plugin.stop().catch(() => {})
          if (cancelar) cancelar(new Error('timeout'))
        }, MAX_ESCUCHA_MS)
        reiniciarRelojIntento()
        plugin.start({ ...options, language: idioma, offline: seleccion.offline }).then(resolver, rechazar)
      })
      const textoFinal = resultado?.text?.trim() || transcriptParcial.value?.trim() || ''
      transcript.value = textoFinal
      transcriptParcial.value = textoFinal
      confidence.value = Number(resultado?.confidence) || (textoFinal ? 0.8 : 0)
      alternativas.value = Array.isArray(resultado?.alternativas) && resultado.alternativas.length > 0
        ? resultado.alternativas.map(a => ({ texto: a?.text ?? a?.texto ?? '', confianza: Number(a?.confidence ?? a?.confianza) || 0 }))
        : (textoFinal ? [{ texto: textoFinal, confianza: confidence.value }] : [])
      estado.value = 'ready'
      registrar('stt.listo', {
        backend: 'native',
        texto: textoFinal,
        confidence: confidence.value,
        alternativas: alternativas.value.length
      })
    } catch (e) {
      const detalle = e?.message || 'Error desconocido'
      codigoError.value = e?.code != null ? String(e.code) : null
      const parcial = transcriptParcial.value?.trim()
      registrar('stt.error_js', {
        backend: 'native',
        detalle,
        code: codigoError.value,
        microListo: microListo.value,
        parcial: parcial || ''
      })
      // Si falló por un error REAL del motor y el oyente parcial capturó la
      // frase, se usa lo capturado. `timeout` de la app queda fuera a propósito:
      // ahí el parcial está truncado ("vende un") y aceptarlo sería mentir.
      const motivosRescate = [
        'no_match', 'speech_timeout', 'server_disconnected',
        'error_server', 'error_network', 'network_timeout', 'language_unavailable'
      ]
      if (parcial && motivosRescate.some(motivo => detalle.includes(motivo))) {
        registrar('stt.rescate_js', { texto: parcial, code: codigoError.value })
        transcript.value = parcial
        confidence.value = 0.8
        alternativas.value = [{ texto: parcial, confianza: 0.8 }]
        estado.value = 'ready'
        return
      }
      if (esCancelacion(detalle)) estado.value = 'cancelled'
      else {
        error.value = mensajeStt(detalle)
        estado.value = 'error'
      }
    } finally {
      detenerRelojes()
      if (timerMicroListo) {
        clearTimeout(timerMicroListo)
        timerMicroListo = null
      }
      for (const escucha of [nativePartial, nativeReady, nativeStt]) {
        if (!escucha) continue
        try {
          await escucha.remove()
        } catch {
          // ignore
        }
      }
      microListo.value = false
      faseStt.value = 'idle'
      limpiarVigilantes()
      await sincronizarDiagNativo()
    }
  }

  /** Reinicia el reloj del intento en curso (cada señal de vida del motor). */
  function reiniciarRelojIntento() {
    if (!cancelarIntento) return
    if (relojIntento) clearTimeout(relojIntento)
    relojIntento = setTimeout(() => {
      relojIntento = null
      const cancelar = cancelarIntento
      cancelarIntento = null
      if (!cancelar) return
      registrar('stt.timeout', { ms: INTENTO_TIMEOUT_MS, microListo: microListo.value })
      if (pluginActivo?.stop) pluginActivo.stop().catch(() => {})
      cancelar(new Error('timeout'))
    }, INTENTO_TIMEOUT_MS)
  }

  function detenerRelojes() {
    if (relojIntento) {
      clearTimeout(relojIntento)
      relojIntento = null
    }
    if (topeEscucha) {
      clearTimeout(topeEscucha)
      topeEscucha = null
    }
    cancelarIntento = null
  }

  async function stopListening(abandon = true) {
    auth.registrarActividad()
    detenerRelojes()
    if (abandon) {
      limpiarVigilantes()
      faseStt.value = 'idle'
    } else {
      // Push-to-talk / toque para enviar: se pide el resultado sin descartarlo.
      pedirFinal('manual')
    }
    if (esNativo.value) {
      const plugin = pluginActivo || seleccionMotor.value?.plugin
      try {
        // En !abandon, pedirFinal() ya llamó a finish().
        if (abandon) await plugin.stop()
      } catch {
        // ignore
      }
    } else if (instanciaWeb) {
      try {
        if (abandon) {
          if (instanciaWeb.abort) instanciaWeb.abort()
          else instanciaWeb.stop()
        } else {
          instanciaWeb.stop()
        }
      } catch {
        // ignore
      }
      if (abandon) instanciaWeb = null
    }
    if (abandon) estado.value = 'idle'
    else microListo.value = false
  }

  function reset() {
    estado.value = 'idle'
    transcript.value = ''
    transcriptParcial.value = ''
    confidence.value = 0
    error.value = null
    codigoError.value = null
    alternativas.value = []
    microListo.value = false
    faseStt.value = 'idle'
    limpiarVigilantes()
  }

  // Recupera la traza de la última sesión (queda visible hasta iniciar otra).
  void cargarTrazaGuardada()
  // Comprueba acceso real a Internet para elegir motor (Google / Vosk).
  void asegurarConectividad()
  void cargarPreferenciaMotor()
  void cargarPreferenciaIdioma()

  // Cada callback nativo del reconocedor se vuelca en la traza local y ajusta
  // la UI: "Habla ahora" solo mientras el motor está capturando de verdad.
  // Solo se escuchan motores con evento global (Google). Vosk/futuros se
  // escuchan por escucha, y solo si el usuario los selecciona.
  if (esNativo.value) {
    for (const motor of MOTORES) {
      if (!motor.enabled || !motor.eventoGlobal) continue
      if (typeof motor.plugin?.addListener !== 'function') continue
      try {
        const handle = motor.plugin.addListener('sttEvent', (data = {}) => {
          const { event, ...resto } = data
          procesarEventoStt(event || 'evento', resto)
        })
        if (handle && typeof handle.catch === 'function') handle.catch(() => {})
      } catch {
        /* noop */
      }
    }
  }

  // Al volver del segundo plano o abrir Ajustes, se recupera lo persistido.
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void cargarTrazaGuardada()
    })
  }

  return {
    estado,
    transcript,
    transcriptParcial,
    confidence,
    alternativas,
    error,
    codigoError,
    cargandoModelo,
    microListo,
    // Fase del STT para la UI: idle | preparando | capturando | procesando.
    faseStt,
    // Cambio de texto en los últimos 1,5 s (señal real de "te escucho").
    textoReciente,
    esNativo,
    backend,
    esWebSoportado,
    sttOfflineDisponible,
    nativoDisponible,
    permisoMicrofono,
    motorStt,
    onDeviceStt,
    serviciosStt,
    // Motor de voz usado en la escucha actual: 'google' | 'vosk' | 'web' | null.
    motorVoz,
    // Hay acceso real a Internet (no solo interfaz de red).
    hayInternet: readonly(hayInternet),
    check,
    pedirPermisoMicrofono,
    disponible,
    isListening,
    startListening,
    stopListening,
    reset,
    // Diagnóstico local
    trazaActiva,
    traza,
    ultimoEvento,
    iniciarTraza,
    detenerTraza,
    limpiarTraza,
    refrescarTraza,
    sincronizarDiagNativo,
    textoTraza,
    resumenTraza,
    textoResumenTraza,
    registrar,
    // Selección de motor
    preferenciaMotor,
    nombreMotor,
    seleccionMotor,
    modoActual,
    opcionesMotor: OPCIONES_MOTOR,
    cargarPreferenciaMotor,
    guardarPreferenciaMotor,
    pluginParaMotor,
    // Idioma del reconocimiento
    preferenciaIdioma,
    opcionesIdioma: IDIOMAS_VOZ,
    idiomaSistema,
    idiomaEfectivo,
    idiomaEtiqueta,
    idiomaTexto,
    cargarPreferenciaIdioma,
    guardarPreferenciaIdioma
  }
}

let _voiceSingleton = null

export function useVoiceCommand() {
  if (!_voiceSingleton) _voiceSingleton = _useVoiceCommand()
  return _voiceSingleton
}
