import { Preferences } from '@capacitor/preferences'

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
  const disponible = computed(() => {
    if (typeof window === 'undefined') return false
    return typeof window.speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined'
  })

  const voces = ref([])
  const vozUri = ref(null)
  const cargandoVoces = ref(false)

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
  }

  async function cargarVoces() {
    if (!disponible.value || cargandoVoces.value) return
    cargandoVoces.value = true
    try {
      let lista = window.speechSynthesis.getVoices() || []
      if (!lista.length) {
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, 2000)
          const previous = window.speechSynthesis.onvoiceschanged
          window.speechSynthesis.onvoiceschanged = () => {
            clearTimeout(timer)
            if (typeof previous === 'function') previous()
            window.speechSynthesis.onvoiceschanged = previous
            resolve()
          }
        })
        lista = window.speechSynthesis.getVoices() || []
      }

      const ordenadas = [...lista].sort((a, b) => {
        const aEs = String(a?.lang || '').toLowerCase().startsWith('es')
        const bEs = String(b?.lang || '').toLowerCase().startsWith('es')
        if (aEs !== bEs) return aEs ? -1 : 1
        return String(a?.name || '').localeCompare(String(b?.name || ''))
      })

      voces.value = ordenadas

      if (vozUri.value && !ordenadas.some(v => v.voiceURI === vozUri.value)) {
        vozUri.value = null
      }
      if (!vozUri.value && ordenadas.length) {
        const primeraEs = ordenadas.find(v => String(v.lang || '').toLowerCase().startsWith('es'))
        vozUri.value = (primeraEs || ordenadas[0]).voiceURI
        await Preferences.set({ key: PREF_TTS_VOICE, value: vozUri.value }).catch(() => {})
      }
    } finally {
      cargandoVoces.value = false
    }
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

  async function speak(texto) {
    if (!texto) return
    await cargar()
    await cargarVoces()
    if (!disponible.value || !habilitado.value) return

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
    hablando,
    pulsoHabla,
    cargar,
    cargarVoces,
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
