import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { $api, getApiBaseUrl, getAppVersionCode, getAppVersionNombre } from '../utils/api'
import { API_ROUTES } from '../utils/api-paths'

const PREF_METODO = 'update_metodo_entrega'
const PREF_POSPUESTA = 'update_version_pospuesta'

const METODOS = ['automatico', 'navegador', 'interno']

/**
 * useAppUpdate() — Sistema de actualización de la APK (solo Android nativo).
 *
 * Tres capas independientes:
 * 1. Decisión (comprobar): compara la versionCode instalada contra
 *    GET /api/app-version → estado 'actualizada' | 'opcional' | 'obligatoria'.
 *    Sin red, la app sigue en local sin bloquear (offline-first).
 * 2. Entrega (entregar): modo A 'navegador' (window.open _system) hoy;
 *    modo B 'interno' (descarga + instalador, Fase 8). Conmutable sin
 *    tocar el servidor ni la lógica de decisión.
 * 3. Fallback: si la entrega interna falla, cae sola al navegador para que
 *    una actualización (sobre todo obligatoria) nunca quede sin vía.
 */
export function useAppUpdate() {
  const toast = useToast()

  const estado = ref('idle')
  const info = ref(null)
  const versionInstalada = ref(null)
  const versionInstaladaNombre = ref(null)
  const metodo = ref('automatico')
  const error = ref(null)

  function esNativo() {
    try {
      return Capacitor.isNativePlatform()
    } catch {
      return false
    }
  }

  async function cargarMetodo() {
    try {
      const v = await Preferences.get({ key: PREF_METODO })
      metodo.value = METODOS.includes(v.value) ? v.value : 'automatico'
    } catch {
      metodo.value = 'automatico'
    }
  }

  async function guardarMetodo(valor) {
    metodo.value = METODOS.includes(valor) ? valor : 'automatico'
    try {
      await Preferences.set({ key: PREF_METODO, value: metodo.value })
    } catch {
      /* preferencias no disponibles */
    }
  }

  function resolverEstado(instalada, manifiesto) {
    if (instalada == null) return 'actualizada'
    if (instalada < (manifiesto.minVersionCode ?? 0)) return 'obligatoria'
    if (instalada < (manifiesto.latestVersionCode ?? instalada)) return 'opcional'
    return 'actualizada'
  }

  async function leerPospuesta() {
    try {
      const v = await Preferences.get({ key: PREF_POSPUESTA })
      return v.value != null && v.value !== '' ? Number(v.value) : null
    } catch {
      return null
    }
  }

  async function comprobar() {
    if (!esNativo()) {
      estado.value = 'actualizada'
      return estado.value
    }
    if (estado.value === 'obligatoria' || estado.value === 'entregando') return estado.value
    estado.value = 'comprobando'
    error.value = null
    try {
      const instalada = await getAppVersionCode()
      versionInstalada.value = instalada
      versionInstaladaNombre.value = await getAppVersionNombre()
      const manifiesto = await $api(API_ROUTES.appVersion)
      info.value = manifiesto
      const nuevo = resolverEstado(instalada, manifiesto)
      if (nuevo === 'opcional' && (await leerPospuesta()) === manifiesto.latestVersionCode) {
        estado.value = 'actualizada'
      } else {
        estado.value = nuevo
      }
      return estado.value
    } catch (err) {
      // Sin red o servidor caído: se sigue trabajando en local.
      error.value = err
      estado.value = 'actualizada'
      return estado.value
    }
  }

  async function posponer() {
    try {
      await Preferences.set({ key: PREF_POSPUESTA, value: String(info.value?.latestVersionCode ?? '') })
    } catch {
      /* preferencias no disponibles */
    }
    estado.value = 'actualizada'
  }

  async function absolutizarUrl(url) {
    if (/^https?:\/\//i.test(url)) return url
    const base = (await getApiBaseUrl()) || ''
    return `${base.replace(/\/+$/, '')}/${String(url).replace(/^\/+/, '')}`
  }

  async function entregarViaNavegador(url) {
    // '_system' lo intercepta Capacitor y abre el navegador externo,
    // que descarga la APK e invita a instalarla (modo A).
    window.open(url, '_system')
  }

  async function entregarDescargaInterna() {
    // Fase 8: descarga con Filesystem + plugin instalador nativo (modo B).
    // Hoy lanza a propósito para ejercitar el fallback al navegador.
    throw new Error('Descarga interna aún no implementada (Fase 8).')
  }

  async function entregar() {
    const manifiesto = info.value
    if (!manifiesto?.apkUrl) return false
    const url = await absolutizarUrl(manifiesto.apkUrl)
    const metodoEfectivo = metodo.value === 'automatico'
      ? (manifiesto.metodoSugerido === 'interno' ? 'interno' : 'navegador')
      : metodo.value
    estado.value = 'entregando'
    try {
      if (metodoEfectivo === 'interno') {
        await entregarDescargaInterna(url)
      } else {
        await entregarViaNavegador(url)
      }
      estado.value = resolverEstado(versionInstalada.value, manifiesto)
      return true
    } catch {
      // Fallback automático al navegador: la actualización nunca queda sin vía.
      try {
        await entregarViaNavegador(url)
        estado.value = resolverEstado(versionInstalada.value, manifiesto)
        return true
      } catch (errFallback) {
        error.value = errFallback
        estado.value = resolverEstado(versionInstalada.value, manifiesto)
        toast.add({
          title: 'No se pudo abrir la descarga',
          description: 'Revisa tu conexión e inténtalo de nuevo.',
          color: 'error'
        })
        return false
      }
    }
  }

  return {
    estado: readonly(estado),
    info: readonly(info),
    versionInstalada: readonly(versionInstalada),
    versionInstaladaNombre: readonly(versionInstaladaNombre),
    metodo,
    error: readonly(error),
    cargarMetodo,
    guardarMetodo,
    comprobar,
    posponer,
    entregar
  }
}
