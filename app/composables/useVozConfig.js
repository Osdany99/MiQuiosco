import { computed, ref } from 'vue'
import { Preferences } from '@capacitor/preferences'

import { $api } from '../utils/api'
import {
  VOZ_CONFIG_DEFECTO,
  idiomaParaApp,
  motorParaApp,
  normalizarVozConfig
} from '#shared/voz/config'
import { useAuth } from './useAuth'
import { useVoiceCommand } from './useVoiceCommand'

/**
 * useVozConfig — configuración de flota de la voz en el equipo.
 *
 * Flujo:
 * 1. Al crear la app se lee la copia local (Preferences), sin esperar red.
 * 2. El sync descarga `/api/voz/config`; si cambió `version`, se guarda y se
 *    aplican motor e idioma al dock (`voz.motor` / `voz.idioma`).
 * 3. El servicio nativo recibe wake/idioma/motor al arrancar.
 *
 * Sin red y sin copia local se usan los valores por defecto de
 * `shared/voz/config.js`. La configuración no es un dato de negocio: si falla
 * la descarga, la voz sigue funcionando como hasta ahora.
 */

const KEY_CONFIG = 'voz.config'
const KEY_APLICADA = 'voz.config.aplicada'
const SCHEMA = 1

function _create() {
  const auth = useAuth()
  const config = ref({ ...VOZ_CONFIG_DEFECTO })
  const cargada = ref(false)
  const cargando = ref(false)
  const error = ref(null)
  const versionAplicada = ref(0)
  let enCurso = null

  const version = computed(() => Number(config.value.version) || 0)

  async function cargarLocal() {
    if (cargada.value) return config.value
    try {
      const { value } = await Preferences.get({ key: KEY_CONFIG })
      if (value) {
        const parsed = JSON.parse(value)
        config.value = normalizarVozConfig(parsed)
      }
      const { value: aplicada } = await Preferences.get({ key: KEY_APLICADA })
      if (aplicada) versionAplicada.value = Math.max(0, Number(aplicada) || 0)
    } catch {
      /* sin caché: quedan los valores por defecto */
    }
    cargada.value = true
    return config.value
  }

  async function persistir() {
    try {
      await Preferences.set({ key: KEY_CONFIG, value: JSON.stringify(config.value) })
      await Preferences.set({ key: KEY_APLICADA, value: String(versionAplicada.value) })
    } catch {
      /* sin persistencia vale para esta sesión */
    }
  }

  /**
   * Vuelca motor/idioma al dock cuando llega una versión nueva. Un cambio
   * manual en Ajustes → Avanzado se respeta hasta el próximo cambio de flota.
   */
  async function aplicarEnPreferencias({ forzar = false } = {}) {
    if (!cargada.value) await cargarLocal()
    const nueva = version.value
    if (nueva <= 0) return false
    if (!forzar && nueva <= versionAplicada.value) return false
    const voz = useVoiceCommand()
    await voz.guardarPreferenciaMotor(motorParaApp(config.value.motor)).catch(() => {})
    await voz.guardarPreferenciaIdioma(idiomaParaApp(config.value.idioma)).catch(() => {})
    versionAplicada.value = nueva
    await persistir()
    return true
  }

  /**
   * Descarga la configuración. `fetchApi` permite reutilizar el `fetch` de
   * `useSync` (que ya añade el JWT); por defecto usa `$api` con el token.
   */
  async function refrescar(fetchApi = $api) {
    if (enCurso) return enCurso
    await cargarLocal()
    if (!auth.jwtSync.value) return config.value

    enCurso = (async () => {
      cargando.value = true
      error.value = null
      try {
        const headers = { Authorization: `Bearer ${auth.jwtSync.value}` }
        const respuesta = await fetchApi('/api/voz/config', { headers })
        if (respuesta?.schema !== SCHEMA || !respuesta?.config) {
          throw new Error('Respuesta de configuración de voz inválida.')
        }
        config.value = normalizarVozConfig(respuesta.config)
        cargada.value = true
        await persistir()
        await aplicarEnPreferencias()
        return config.value
      } catch (e) {
        // Si ya había una copia local, se conserva; si no, quedan los defaults.
        error.value = e?.message ?? 'No se pudo descargar la configuración de voz.'
        await cargarLocal()
        return config.value
      } finally {
        cargando.value = false
        enCurso = null
      }
    })()

    return enCurso
  }

  /** Aplica ya la copia actual (botón de soporte en Ajustes). */
  function aplicarAhora() {
    return aplicarEnPreferencias({ forzar: true })
  }

  return {
    config,
    version,
    cargada,
    cargando,
    error,
    versionAplicada,
    cargar: cargarLocal,
    refrescar,
    aplicarAhora
  }
}

let singleton = null

export function useVozConfig() {
  if (!singleton) singleton = _create()
  return singleton
}
