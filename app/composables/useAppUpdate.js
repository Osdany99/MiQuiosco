import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { $api, getApiBaseUrl, getAppVersionCode, getAppVersionNombre } from '../utils/api'
import { API_ROUTES } from '../utils/api-paths'
import { puedeInstalarApps, abrirAjusteInstalador, instalarApk } from '../utils/appInstall'

const PREF_METODO = 'update_metodo_entrega'
const PREF_POSPUESTA = 'update_version_pospuesta'

const METODOS = ['automatico', 'navegador', 'interno']

const APK_CACHE = 'miquiosco-actualizacion.apk'
// Filesystem.downloadFile no admite cancelación. Los timeouts nativos cortan una
// conexión muerta o un APK que deja de llegar; el de JS es la red de seguridad
// para cuando el nativo no cuelga pero tampoco avanza (servidor que sirve a
// tirones). Ante cualquiera de los dos se cae al navegador, y el archivo
// huérfano se limpia al arrancar la app (limpiarDescargaPrevia).
const TIMEOUT_CONEXION_MS = 20000
const TIMEOUT_LECTURA_MS = 30000
const TIMEOUT_DESCARGA_MS = 5 * 60 * 1000

// Estados en los que hay una entrega en curso: no se re-consulta el manifiesto
// ni se borra la caché, para no pisar la descarga o el instalador abiertos.
const ESTADOS_OCUPADOS = ['obligatoria', 'descargando', 'instalando', 'entregando']

// Se incrementa en cada descarga interna para que los eventos de progreso de
// una descarga anterior no actualicen la barra de la nueva.
let contadorDescarga = 0

/**
 * useAppUpdate() — Sistema de actualización de la APK (solo Android nativo).
 *
 * Tres capas independientes:
 * 1. Decisión (comprobar): compara la versionCode instalada contra
 *    GET /api/app-version → estado 'actualizada' | 'opcional' | 'obligatoria'.
 *    Sin red, la app sigue en local sin bloquear (offline-first).
 * 2. Entrega (entregar): modo A 'navegador' (window.open _system);
 *    modo B 'interno' (descarga en la app + instalador del sistema, Fase 8).
 *    Conmutable sin tocar el servidor ni la lógica de decisión.
 * 3. Fallback: si la entrega interna falla, cae sola al navegador para que
 *    una actualización (sobre todo obligatoria) nunca quede sin vía. La única
 *    excepción es el permiso de instalación, que se espera al usuario en vez de
 *    saltarse sus ajustes (estado 'espera-permiso').
 *
 * Estados: idle | comprobando | actualizada | opcional | obligatoria
 *          | descargando | instalando | espera-permiso
 *
 * El estado vive a scope de módulo y no dentro de la función: `app.vue` y
 * `pages/settings.vue` llaman a `useAppUpdate()` por separado, y con refs
 * propias cada una vería su propio estado (el diálogo de app.vue nunca se
 * abriría al comprobar desde Ajustes). Un único estado compartido es lo que
 * ambos supuestos.
 */
const estado = ref('idle')
const info = ref(null)
const versionInstalada = ref(null)
const versionInstaladaNombre = ref(null)
const metodo = ref('automatico')
const error = ref(null)
const progreso = ref({ pct: 0, bytes: 0, contentLength: 0 })
// Recuerda si el flujo actual es obligatorio: 'espera-permiso' sustituye a
// 'obligatoria' mientras espera al usuario, pero la app debe seguir bloqueada.
const flujoObligatorio = ref(false)

export function useAppUpdate() {
  // useToast() necesita contexto de componente, así que vive aquí y no a
  // scope de módulo. Los toasts son globales vía UApp.
  const toast = useToast()

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
    if (ESTADOS_OCUPADOS.includes(estado.value)) return estado.value
    estado.value = 'comprobando'
    error.value = null
    flujoObligatorio.value = false
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
        flujoObligatorio.value = nuevo === 'obligatoria'
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

  function conTimeout(promesa, ms, mensaje) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(mensaje)), ms)
      promesa.then(
        (v) => {
          clearTimeout(t)
          resolve(v)
        },
        (e) => {
          clearTimeout(t)
          reject(e)
        }
      )
    })
  }

  /**
   * Borra el APK que hubiera quedado a medias en la caché (descuesta cancelada,
   * proceso muerto durante la instalación). Al arrancar no hay nada en
   * curso, así que es seguro.
   */
  async function limpiarDescargaPrevia() {
    if (!esNativo() || ESTADOS_OCUPADOS.includes(estado.value)) return
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem')
      await Filesystem.deleteFile({ path: APK_CACHE, directory: Directory.Cache })
    } catch {
      /* no existía o no se pudo borrar */
    }
  }

  /**
   * Modo B: descarga la APK dentro de la app y abre el instalador del sistema.
   * Lanza 'PERMISSION_REQUIRED' si falta el permiso especial de instalación,
   * señal para que quien llama espere al usuario en vez de caer al navegador.
   */
  async function entregarDescargaInterna(url) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem')

    if (!(await puedeInstalarApps())) {
      const err = new Error('Permiso de instalación no concedido')
      err.code = 'PERMISSION_REQUIRED'
      throw err
    }

    estado.value = 'descargando'
    progreso.value = { pct: 0, bytes: 0, contentLength: 0 }

    // Cada descarga registra su propio listener con un token propio, así los
    // eventos rezagados de una descarga anterior no pisan el progreso actual.
    const token = ++contadorDescarga
    const handle = await Filesystem.addListener('progress', (p) => {
      if (token !== contadorDescarga) return
      const bytes = Number(p?.bytes) || 0
      const total = Number(p?.contentLength) || 0
      progreso.value = {
        bytes,
        contentLength: total,
        pct: total > 0 ? Math.min(100, Math.round((bytes / total) * 100)) : 0
      }
    })

    try {
      const res = await conTimeout(
        Filesystem.downloadFile({
          url,
          path: APK_CACHE,
          directory: Directory.Cache,
          recursive: true,
          progress: true,
          connectTimeout: TIMEOUT_CONEXION_MS,
          readTimeout: TIMEOUT_LECTURA_MS
        }),
        TIMEOUT_DESCARGA_MS,
        'La descarga de la actualización tardó demasiado'
      )

      estado.value = 'instalando'
      progreso.value = { ...progreso.value, pct: 100 }

      const ok = await instalarApk(res?.path)
      if (!ok) throw new Error('No se pudo abrir el instalador del sistema')
    } finally {
      handle.remove().catch(() => {})
    }
  }

  function abrirAjustes() {
    return abrirAjusteInstalador()
  }

  async function entregar() {
    const manifiesto = info.value
    if (!manifiesto?.apkUrl) return false
    const url = await absolutizarUrl(manifiesto.apkUrl)
    const metodoEfectivo = metodo.value === 'automatico'
      ? (manifiesto.metodoSugerido === 'interno' ? 'interno' : 'navegador')
      : metodo.value
    progreso.value = { pct: 0, bytes: 0, contentLength: 0 }
    estado.value = 'entregando'
    try {
      if (metodoEfectivo === 'interno') {
        await entregarDescargaInterna(url)
        // Se queda en 'instalando': la versionCode solo cambia cuando el
        // usuario acepta en el instalador, así que un resolverEstado() aquí
        // reabriría el diálogo. refrescar() lo actualiza al volver a la app.
        return true
      }
      await entregarViaNavegador(url)
      estado.value = resolverEstado(versionInstalada.value, manifiesto)
      return true
    } catch (err) {
      // El permiso especial de instalación se espera al usuario: caer al
      // navegador saltándose sus ajustes sería justo lo que el modo interno
      // evita. Para el resto de fallos se mantiene el fallback automático.
      if (err?.code === 'PERMISSION_REQUIRED' && metodoEfectivo === 'interno') {
        error.value = err
        estado.value = 'espera-permiso'
        return false
      }
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

  /** Reintenta la entrega interna tras conceder el permiso en Ajustes. */
  function reintentar() {
    estado.value = 'opcional'
    error.value = null
    return entregar()
  }

  /**
   * Abandona el modo interno y entrega por navegador. Deja el método en
   * 'navegador' para que no vuelva a pedir el permiso en cada actualización.
   */
  async function usarNavegador() {
    metodo.value = 'navegador'
    try {
      await Preferences.set({ key: PREF_METODO, value: 'navegador' })
    } catch {
      /* preferencias no disponibles */
    }
    estado.value = 'opcional'
    error.value = null
    return entregar()
  }

  /**
   * Vuelve a consultar el manifiesto. Se usa al volver a la app tras abrir el
   * instalador: la versionCode solo cambia si el usuario aceptó la instalación.
   */
  async function refrescar() {
    estado.value = 'idle'
    return comprobar()
  }

  return {
    estado: readonly(estado),
    info: readonly(info),
    versionInstalada: readonly(versionInstalada),
    versionInstaladaNombre: readonly(versionInstaladaNombre),
    metodo,
    progreso: readonly(progreso),
    flujoObligatorio: readonly(flujoObligatorio),
    cargarMetodo,
    guardarMetodo,
    comprobar,
    posponer,
    entregar,
    reintentar,
    usarNavegador,
    refrescar,
    abrirAjustes,
    limpiarDescargaPrevia,
    esNativo
  }
}
