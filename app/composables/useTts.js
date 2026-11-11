import { Capacitor, registerPlugin } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

const TtsNative = registerPlugin('TtsNative')

const PREF_TTS = 'voice.tts.enabled'
const PREF_TTS_VOICE = 'voice.tts.voiceUri'
const PREF_GREETING = 'voice.greeting.enabled'

function _useTts() {
  const habilitado = ref(true)
  const greetingEnabled = ref(false)
  // Estado para animar la onda mientras la app habla.
  const hablando = ref(false)
  const pulsoHabla = ref(0)
  let inicializado = false
  const esNativo = computed(() => {
    try {
      return Capacitor.isNativePlatform()
    } catch {
      return false
    }
  })
  const disponible = computed(() => {
    // En Android nativo, el plugin TtsNative ya está registrado: speechSynthesis
    // del dispositivo funciona sin necesidad de listar voces vía WebView.
    if (esNativo.value) return true
    if (typeof window === 'undefined') return false
    const hasSynthesis = typeof window.speechSynthesis !== 'undefined'
    const hasUtterance = typeof window.SpeechSynthesisUtterance !== 'undefined'
    return hasSynthesis && hasUtterance
  })

  // Estado del motor nativo (Android). Se rellena con checkNativo().
  const nativoDisponible = ref(null)
  const nativoEngine = ref('')

  /** Hay motor de voz pero no se pudo listar ninguna voz. */
  const vocesVacias = computed(() => disponible.value && voces.value.length === 0)

  const voces = ref([])
  const vozUri = ref(null)
  const cargandoVoces = ref(false)

  // Listener nativo para eventos de TTS (start/boundary/end/error).
  let ttsEventListener = null

  async function cargar() {
    if (inicializado) return
    inicializado = true
    try {
      const { value } = await Preferences.get({ key: PREF_TTS })
      if (value === null) {
        habilitado.value = true
        await Preferences.set({ key: PREF_TTS, value: 'true' })
      } else {
        habilitado.value = value === 'true'
      }
    } catch {
      habilitado.value = false
    }
    try {
      const { value } = await Preferences.get({ key: PREF_TTS_VOICE })
      if (value) vozUri.value = value
    } catch {}
    try {
      const { value } = await Preferences.get({ key: PREF_GREETING })
      greetingEnabled.value = value === 'true'
    } catch {
      greetingEnabled.value = false
    }
    // Inicializar el motor nativo en Android.
    if (esNativo.value) {
      await checkNativo()
    }
  }

  /** Consulta el motor TTS nativo (solo Android). */
  async function checkNativo() {
    if (!esNativo.value) return
    try {
      const r = await TtsNative.check()
      nativoDisponible.value = Boolean(r?.available)
      nativoEngine.value = r?.engineName || ''
    } catch {
      nativoDisponible.value = false
      nativoEngine.value = ''
    }
  }

  // ────────────────────────────────────────────
  //  Cargar voces
  // ────────────────────────────────────────────

  async function cargarVoces() {
    if (cargandoVoces.value) return
    // En nativo esperamos a que el motor esté listo.
    if (esNativo.value && nativoDisponible.value == null) {
      await checkNativo()
    }
    if (!disponible.value) return
    cargandoVoces.value = true
    try {
      if (esNativo.value) {
        await _cargarVocesNativas()
      } else {
        await _cargarVocesWeb()
      }
    } finally {
      cargandoVoces.value = false
    }
  }

  /** Carga voces vía plugin nativo (Android). */
  async function _cargarVocesNativas() {
    try {
      const r = await TtsNative.getVoices({ language: '' })
      const lista = Array.isArray(r?.voices) ? r.voices : []

      // Normalizar al formato { name, lang, voiceURI, offline }.
      const normalizadas = lista.map(v => ({
        name: v.name || v.lang || '',
        lang: v.lang || '',
        voiceURI: v.name || v.lang || '',
        offline: Boolean(v.offline),
        quality: Number(v.quality) || 0,
        installed: Boolean(v.installed)
      }))

      // Ordenar: español primero, luego offline primero, luego nombre.
      const ordenadas = normalizadas.sort((a, b) => {
        const aEs = String(a.lang).toLowerCase().startsWith('es')
        const bEs = String(b.lang).toLowerCase().startsWith('es')
        if (aEs !== bEs) return aEs ? -1 : 1
        if (a.offline !== b.offline) return a.offline ? -1 : 1
        return String(a.name).localeCompare(String(b.name))
      })

      voces.value = ordenadas
      _seleccionarVozPorDefecto(ordenadas)
    } catch {
      voces.value = []
    }
  }

  /** Carga voces vía Web Speech API (navegador). */
  async function _cargarVocesWeb() {
    let lista = window.speechSynthesis.getVoices() || []
    if (!lista.length) {
      // Algunas WebViews (Android) no disparan onvoiceschanged ni cargan
      // las voces de forma inmediata. Esperamos hasta 5 s y reintentamos.
      await new Promise((resolve) => {
        let resuelto = false
        const timer = setTimeout(() => {
          if (!resuelto) {
            resuelto = true
            resolve()
          }
        }, 5000)
        const previous = window.speechSynthesis.onvoiceschanged
        window.speechSynthesis.onvoiceschanged = () => {
          clearTimeout(timer)
          if (!resuelto) {
            resuelto = true
            resolve()
          }
          if (typeof previous === 'function') previous()
          window.speechSynthesis.onvoiceschanged = previous
        }
      })
      lista = window.speechSynthesis.getVoices() || []
      if (!lista.length) {
        // Segundo intento tras una pausa corta.
        await new Promise(resolve => setTimeout(resolve, 1000))
        lista = window.speechSynthesis.getVoices() || []
      }
    }

    const ordenadas = [...lista].sort((a, b) => {
      const aEs = String(a?.lang || '').toLowerCase().startsWith('es')
      const bEs = String(b?.lang || '').toLowerCase().startsWith('es')
      if (aEs !== bEs) return aEs ? -1 : 1
      return String(a?.name || '').localeCompare(String(b?.name || ''))
    })

    voces.value = ordenadas
    _seleccionarVozPorDefecto(ordenadas)
  }

  /** Selecciona la voz guardada o la primera en español. */
  function _seleccionarVozPorDefecto(ordenadas) {
    if (vozUri.value && !ordenadas.some(v => v.voiceURI === vozUri.value)) {
      vozUri.value = null
    }
    if (!vozUri.value && ordenadas.length) {
      const primeraEs = ordenadas.find(v =>
        String(v.lang || '').toLowerCase().startsWith('es')
      )
      vozUri.value = (primeraEs || ordenadas[0]).voiceURI
      Preferences.set({ key: PREF_TTS_VOICE, value: vozUri.value }).catch(() => {})
    }
  }

  async function refrescarVoces() {
    voces.value = []
    vozUri.value = null
    cargandoVoces.value = false
    if (esNativo.value) await checkNativo()
    await cargarVoces()
  }

  async function setHabilitado(valor) {
    habilitado.value = Boolean(valor)
    try {
      await Preferences.set({ key: PREF_TTS, value: String(habilitado.value) })
    } catch {}
  }

  async function setVoz(uri) {
    vozUri.value = uri || null
    try {
      if (uri) await Preferences.set({ key: PREF_TTS_VOICE, value: uri })
      else await Preferences.remove({ key: PREF_TTS_VOICE })
    } catch {}
  }

  async function setGreetingEnabled(value) {
    greetingEnabled.value = Boolean(value)
    try {
      await Preferences.set({ key: PREF_GREETING, value: String(greetingEnabled.value) })
    } catch {
      /* noop */
    }
  }

  function vozActual() {
    return voces.value.find(v => v.voiceURI === vozUri.value) || null
  }

  // ────────────────────────────────────────────
  //  speak()
  // ────────────────────────────────────────────

  async function speak(texto) {
    if (!texto) return
    await cargar()
    await cargarVoces()
    if (!disponible.value || !habilitado.value) return

    if (esNativo.value) {
      return _speakNativo(texto)
    }
    return _speakWeb(texto)
  }

  /** Habla usando el motor TTS nativo de Android. */
  async function _speakNativo(texto) {
    const maxMs = Math.max(2500, String(texto).length * 90)
    return new Promise((resolve) => {
      const terminar = () => {
        hablando.value = false
        pulsoHabla.value = 0
        if (ttsEventListener) {
          try {
            ttsEventListener.remove()
          } catch {}
          ttsEventListener = null
        }
        resolve()
      }
      const timer = setTimeout(terminar, maxMs)

      // Escuchar eventos nativos (start/boundary/end/error).
      if (TtsNative.addListener) {
        try {
          // Limpiar listener anterior si quedó colgado.
          if (ttsEventListener) {
            try {
              ttsEventListener.remove()
            } catch {}
            ttsEventListener = null
          }
          TtsNative.addListener('ttsEvent', (data) => {
            const ev = data?.event
            if (ev === 'start') {
              hablando.value = true
            } else if (ev === 'boundary') {
              pulsoHabla.value = 0.55 + Math.random() * 0.45
            } else if (ev === 'end' || ev === 'error') {
              clearTimeout(timer)
              terminar()
            }
          }).then((handle) => { ttsEventListener = handle })
            .catch(() => {})
        } catch {}
      }

      const v = vozActual()
      hablando.value = true
      TtsNative.speak({
        text: String(texto),
        voiceName: v?.voiceURI || '',
        language: v?.lang || 'es-ES',
        rate: 1.0
      }).then(() => {
        // onDone del plugin ya resuelve, pero por si el listener no se enganchó:
        clearTimeout(timer)
        terminar()
      }).catch(() => {
        clearTimeout(timer)
        terminar()
      })
    })
  }

  /** Habla usando Web Speech API (navegador). */
  function _speakWeb(texto) {
    const maxMs = Math.max(2500, String(texto).length * 90)
    return new Promise((resolve) => {
      const terminar = () => {
        hablando.value = false
        pulsoHabla.value = 0
        resolve()
      }
      const timer = setTimeout(terminar, maxMs)
      try {
        window.speechSynthesis.cancel()
        const u = new SpeechSynthesisUtterance(String(texto))
        u.lang = 'es-ES'
        u.rate = 1
        const v = vozActual()
        if (v) {
          u.voice = v
          if (v.lang) u.lang = v.lang
        }
        u.onstart = () => {
          hablando.value = true
        }
        // Cada palabra empuja la onda; entre palabras decae sola.
        u.onboundary = () => {
          pulsoHabla.value = 0.55 + Math.random() * 0.45
        }
        u.onend = () => {
          clearTimeout(timer)
          terminar()
        }
        u.onerror = () => {
          clearTimeout(timer)
          terminar()
        }
        hablando.value = true
        window.speechSynthesis.speak(u)
      } catch {
        clearTimeout(timer)
        terminar()
      }
    })
  }

  void cargar()
  void cargarVoces()

  return {
    habilitado,
    disponible,
    greetingEnabled,
    voces,
    vozUri,
    cargandoVoces,
    vocesVacias,
    hablando,
    pulsoHabla,
    nativoDisponible,
    nativoEngine,
    cargar,
    cargarVoces,
    refrescarVoces,
    setHabilitado,
    setGreetingEnabled,
    setVoz,
    speak
  }
}

let _ttsSingleton = null
export function useTts() {
  if (!_ttsSingleton) _ttsSingleton = _useTts()
  return _ttsSingleton
}
