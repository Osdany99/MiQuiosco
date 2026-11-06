import { Preferences } from '@capacitor/preferences'

const PREF_TTS = 'voice.tts.enabled'

export function useTts() {
  const habilitado = ref(true)
  let inicializado = false
  const disponible = computed(() => {
    if (typeof window === 'undefined') return false
    return typeof window.speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined'
  })

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
  }

  async function setHabilitado(valor) {
    habilitado.value = Boolean(valor)
    try {
      await Preferences.set({ key: PREF_TTS, value: String(habilitado.value) })
    } catch {}
  }

  async function speak(texto) {
    if (!texto) return
    await cargar()
    if (!habilitado.value || !disponible.value) return
    try {
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(String(texto))
      u.lang = 'es-ES'
      u.rate = 1
      window.speechSynthesis.speak(u)
    } catch {}
  }

  void cargar()
  return { habilitado, disponible, cargar, setHabilitado, speak }
}
