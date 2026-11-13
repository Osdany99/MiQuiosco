import { Capacitor, registerPlugin } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { mensajeStt } from '../utils/voice/stt'
import { hayInternet, cargarEstadoConectividad } from '../composables/useConectividad'
import {
  formatearEntrada,
  formatearResumen,
  formatearTraza,
  fusionarTrazas,
  resumirTraza
} from '../utils/voice/diagnostico'

const VoiceRecognitionNative = registerPlugin('VoiceRecognitionNative')
const VoskVoice = registerPlugin('VoskVoice')

// Tiempo máximo SIN actividad del reconocedor dentro de un intento. Se reinicia
// con cada `start`/`ready`/`partial` nativo, así que ya no corta una frase a
// mitad: solo actúa si el motor se queda colgado de verdad.
const INTENTO_TIMEOUT_MS = 20_000
// Tope absoluto de una escucha completa (incluye reintentos del plugin).
const MAX_ESCUCHA_MS = 45_000
const MAX_TRAZA = 2000
const KEY_TRAZA = 'voz.diagnostico'
// Escritura síncrona en localStorage: sobrevive a recargas y a que Android
// mate la app, aunque el guardado asíncrono en Preferences no llegue.
const KEY_TRAZA_LOCAL = 'voz.diagnostico.local'
const PERSISTIR_CADA_MS = 1500

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
  let instanciaWeb = null
  // Reloj por intento del reconocedor nativo. Se reinicia con cada evento del
  // motor, así que solo dispara si el intento se queda realmente colgado.
  let relojIntento = null
  let topeEscucha = null
  let cancelarIntento = null
  // Plugin nativo activo en la escucha actual (Google o Vosk). stopListening
  // lo necesita para detener el motor correcto.
  let pluginActivo = null

  /** Devuelve true si debe usarse Vosk (offline empaquetado) en lugar de Google. */
  function motorVozOffline() {
    // null = aún no se comprobó: asume offline para no depender de Google.
    return hayInternet.value !== true
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
    if (!esNativo.value || typeof VoiceRecognitionNative.diag !== 'function') return
    try {
      const r = await VoiceRecognitionNative.diag()
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
      const r = await VoiceRecognitionNative.check()
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
      const r = await VoiceRecognitionNative.requestPermission()
      const ok = !r || r.ok !== false
      await check()
      return ok
    } catch {
      await check()
      return false
    }
  }

  async function startListening(options = { language: 'es-ES' }) {
    if (estado.value === 'listening') return
    if (options?.contexto) {
      contextoInicio = {
        modo: options.contexto.modo ?? contextoInicio?.modo ?? null,
        red: options.contexto.red ?? contextoInicio?.red ?? null
      }
    }
    registrar('stt.begin', {
      idioma: options?.language || 'es-ES',
      offline: options?.offline ?? null,
      backend: backend.value,
      microListo: microListo.value
    })
    estado.value = 'listening'
    microListo.value = false
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
          rec.lang = options?.language || 'es-ES'
          rec.interimResults = true
          rec.maxAlternatives = 5
          rec.continuous = false
          rec.onaudiostart = () => {
            microListo.value = true
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
            if (actual.isFinal) {
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
      }
      return
    }

    // Elige el motor: Google si hay Internet real, Vosk si no.
    const plugin = motorVozOffline() ? VoskVoice : VoiceRecognitionNative
    motorVoz.value = plugin === VoskVoice ? 'vosk' : 'google'
    pluginActivo = plugin
    registrar('stt.begin', {
      idioma: options?.language || 'es-ES',
      offline: plugin === VoskVoice,
      motor: motorVoz.value,
      backend: backend.value,
      microListo: microListo.value
    })
    let nativePartial = null
    let nativeReady = null
    try {
      auth.registrarActividad()
      const permiso = await plugin.requestPermission()
      if (permiso && permiso.ok === false) throw new Error('insufficient_permissions')
      // Ambos plugins emiten sttEvent (start/ready/partial/result/error/stop/finish).
      // VoiceRecognitionNative además expone partialResult y ready como eventos
      // propios; VoskVoice solo usa sttEvent. Escuchamos ambos para no perder
      // parciales en ningún motor.
      if (plugin.addListener) {
        nativePartial = await plugin.addListener('partialResult', (d) => {
          transcriptParcial.value = d?.text ?? transcriptParcial.value
          reiniciarRelojIntento()
        })
      }
      if (plugin.addListener) {
        nativeReady = await plugin.addListener('ready', () => {
          microListo.value = true
          reiniciarRelojIntento()
        })
      }
      const resultado = await new Promise((resolver, rechazar) => {
        cancelarIntento = rechazar
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
        plugin.start(options).then(resolver, rechazar)
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
      for (const escucha of [nativePartial, nativeReady]) {
        if (!escucha) continue
        try {
          await escucha.remove()
        } catch {
          // ignore
        }
      }
      microListo.value = false
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
      VoiceRecognitionNative.stop().catch(() => {})
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
    if (esNativo.value) {
      const plugin = pluginActivo || VoiceRecognitionNative
      try {
        if (abandon) await plugin.stop()
        else await plugin.finish()
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
    microListo.value = false
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
  }

  // Recupera la traza de la última sesión (queda visible hasta iniciar otra).
  void cargarTrazaGuardada()
  // Comprueba acceso real a Internet para elegir motor (Google / Vosk).
  void asegurarConectividad()

  // Cada callback nativo del reconocedor se vuelca en la traza local y ajusta
  // la UI: "Habla ahora" solo mientras el motor está capturando de verdad.
  if (esNativo.value && typeof VoiceRecognitionNative.addListener === 'function') {
    try {
      const handle = VoiceRecognitionNative.addListener('sttEvent', (data = {}) => {
        const { event, ...resto } = data
        const nombre = event || 'evento'
        // Vosk solo emite sttEvent: actualiza el parcial en vivo desde ahí.
        if (nombre === 'partial' && resto?.texto) {
          transcriptParcial.value = resto.texto
          reiniciarRelojIntento()
        }
        if (nombre === 'ready') microListo.value = true
        else if (nombre === 'start' || nombre === 'retry' || nombre === 'error'
          || nombre === 'end' || nombre === 'stop' || nombre === 'finish') {
          microListo.value = false
        }
        if (nombre === 'start' || nombre === 'ready' || nombre === 'beginning'
          || nombre === 'partial' || nombre === 'end') {
          reiniciarRelojIntento()
        }
        registrar(`stt.${nombre}`, { ...resto, inst: 'native' })
      })
      if (handle && typeof handle.catch === 'function') handle.catch(() => {})
    } catch {
      /* noop */
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
    microListo,
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
    registrar
  }
}

let _voiceSingleton = null

export function useVoiceCommand() {
  if (!_voiceSingleton) _voiceSingleton = _useVoiceCommand()
  return _voiceSingleton
}
