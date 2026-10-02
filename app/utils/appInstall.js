import { Capacitor, registerPlugin } from '@capacitor/core'

/**
 * Puente con `ApkInstallerPlugin` (Java, en android/app/src/main/java).
 * Solo existe en Android nativo: en web `registerPlugin` falla, así que el
 * registro es perezoso y todas las funciones responden `false`/`null`.
 */
let _plugin = null

function plugin() {
  if (_plugin) return _plugin
  if (!Capacitor.isNativePlatform()) return null
  try {
    _plugin = registerPlugin('ApkInstaller')
  } catch {
    _plugin = null
  }
  return _plugin
}

/**
 * ¿La app puede lanzar el instalador? En API >= 26 depende del permiso especial
 * "Instalar apps desconocidas". Abajo de 26 siempre es true.
 */
export async function puedeInstalarApps() {
  const p = plugin()
  if (!p) return false
  try {
    const res = await p.canInstall()
    return res?.allowed === true
  } catch {
    return false
  }
}

/** Abre Ajustes → "Instalar apps desconocidas" para esta app. */
export async function abrirAjusteInstalador() {
  const p = plugin()
  if (!p) return false
  try {
    await p.openPermissionSettings()
    return true
  } catch {
    return false
  }
}

/**
 * Lanza el instalador del sistema sobre un APK ya descargado.
 * @param {string} path ruta absoluta devuelta por Filesystem.downloadFile.
 * @returns {Promise<boolean>} false si el plugin no está disponible o falla.
 */
export async function instalarApk(path) {
  const p = plugin()
  if (!p || !path) return false
  try {
    await p.install({ path })
    return true
  } catch {
    return false
  }
}

/** Identifica el error de permiso del plugin para poder explicar la acción al usuario. */
export function esErrorDePermiso(err) {
  return err?.code === 'PERMISSION_REQUIRED'
}
