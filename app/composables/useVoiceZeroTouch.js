import { computed, ref } from 'vue'
import { Preferences } from '@capacitor/preferences'
import { useAuth } from './useAuth'

const KEY = 'voice.ceroToques.activo'

export function useVoiceZeroTouch() {
  const auth = useAuth()
  const activo = ref(false)
  const cargado = ref(false)

  async function cargar() {
    try {
      const { value } = await Preferences.get({ key: KEY })
      activo.value = value === 'true'
    } catch {
      activo.value = false
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

  const esJefe = computed(() => {
    try {
      const rol = auth?.usuarioActual?.value?.rol
      return rol === 'jefe' || rol === 'super_admin'
    } catch {
      return false
    }
  })

  return { activo, cargado, setActivo, esJefe, cargar }
}
