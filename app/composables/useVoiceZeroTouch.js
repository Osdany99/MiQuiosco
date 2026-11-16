import { computed, ref } from 'vue'
import { useAuth } from './useAuth'

/**
 * Preferencias fijas de la confirmación hablada.
 *
 * El tiempo de espera del «sí» es **6 segundos** y no se configura: un selector
 * con 3/5/8/10 s solo añadía dudas al jefe y el servicio nativo ya usaba 6 s.
 * Así la app abierta y la app cerrada esperan lo mismo.
 *
 * Antes este composable también guardaba el interruptor «Modo PRO» y el tiempo
 * en `Preferences`; ambos se retiraron.
 */

export const TIMEOUT_CONFIRMACION_MS = 6000

function _create() {
  const auth = useAuth()
  const timeoutMs = ref(TIMEOUT_CONFIRMACION_MS)

  /** La preferencia es fija; se mantiene por compatibilidad con quien llama. */
  async function cargar() {
    return timeoutMs.value
  }

  const esJefe = computed(() => {
    try {
      const rol = auth?.usuarioActual?.value?.rol
      return rol === 'jefe' || rol === 'super_admin'
    } catch {
      return false
    }
  })

  return { timeoutMs, esJefe, cargar }
}

let singleton = null

/**
 * Singleton: el tiempo de espera lo consumen el layout y la venta por voz.
 */
export function useVoiceZeroTouch() {
  if (!singleton) singleton = _create()
  return singleton
}
