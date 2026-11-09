import { computed, ref } from 'vue'
import { Preferences } from '@capacitor/preferences'
import { useAuth } from './useAuth'

const KEY = 'voice.ceroToques.activo'
const KEY_TIMEOUT = 'voice.ceroToques.timeoutMs'
const TIMEOUT_DEFAULT = 5000
const TIMEOUT_MIN = 3000
const TIMEOUT_MAX = 10000

function acotarTimeout(valor) {
  const n = Number(valor)
  if (!Number.isFinite(n)) return TIMEOUT_DEFAULT
  return Math.min(TIMEOUT_MAX, Math.max(TIMEOUT_MIN, Math.trunc(n)))
}

export function useVoiceZeroTouch() {
  const auth = useAuth()
  const activo = ref(false)
  const cargado = ref(false)
  const timeoutMs = ref(TIMEOUT_DEFAULT)

  async function cargar() {
    try {
      const { value } = await Preferences.get({ key: KEY })
      activo.value = value === 'true'
    } catch {
      activo.value = false
    }
    try {
      const { value } = await Preferences.get({ key: KEY_TIMEOUT })
      if (value !== null && value !== undefined) timeoutMs.value = acotarTimeout(value)
    } catch {
      /* noop */
    }
    cargado.value = true
  }

  async function setActivo(val) {
    const v = Boolean(val) && esJefe.value
    activo.value = v
    try {
      await Preferences.set({ key: KEY, value: String(v) })
    } catch {
      /* noop */
    }
    return v
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

  return { activo, cargado, timeoutMs, setActivo, setTimeoutMs, esJefe, cargar }
}
