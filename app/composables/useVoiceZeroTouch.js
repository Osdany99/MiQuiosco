import { computed, ref } from 'vue'
import { Preferences } from '@capacitor/preferences'
import { useAuth } from './useAuth'

/**
 * Preferencia del tiempo de espera de la confirmación hablada.
 *
 * Antes este composable también guardaba el interruptor «Modo PRO». Se retiró:
 * la confirmación por voz ya es el comportamiento normal de una venta por voz,
 * así que aquí solo queda cuánto escucha el micrófono antes de dejar el
 * formulario para confirmar a mano.
 */
const KEY_TIMEOUT = 'voice.ceroToques.timeoutMs'
const TIMEOUT_DEFAULT = 5000
const TIMEOUT_MIN = 3000
const TIMEOUT_MAX = 10000

function acotarTimeout(valor) {
  const n = Number(valor)
  if (!Number.isFinite(n)) return TIMEOUT_DEFAULT
  return Math.min(TIMEOUT_MAX, Math.max(TIMEOUT_MIN, Math.trunc(n)))
}

function _create() {
  const auth = useAuth()
  const timeoutMs = ref(TIMEOUT_DEFAULT)

  async function cargar() {
    try {
      const { value } = await Preferences.get({ key: KEY_TIMEOUT })
      if (value !== null && value !== undefined) timeoutMs.value = acotarTimeout(value)
    } catch {
      /* noop */
    }
  }

  async function setTimeoutMs(val) {
    const v = acotarTimeout(val)
    timeoutMs.value = v
    try {
      await Preferences.set({ key: KEY_TIMEOUT, value: String(v) })
    } catch {
      /* noop */
    }
    return v
  }

  const esJefe = computed(() => {
    try {
      const rol = auth?.usuarioActual?.value?.rol
      return rol === 'jefe' || rol === 'super_admin'
    } catch {
      return false
    }
  })

  return { timeoutMs, setTimeoutMs, esJefe, cargar }
}

let singleton = null

/**
 * Singleton: el tiempo de espera lo consumen el layout y Ajustes. Sin esto cada
 * `useVoiceZeroTouch()` tenía su propio `timeoutMs` y podía diferir del que
 * muestra la pantalla.
 */
export function useVoiceZeroTouch() {
  if (!singleton) singleton = _create()
  return singleton
}
