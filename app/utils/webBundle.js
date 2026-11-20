import { Capacitor, registerPlugin } from '@capacitor/core'

/**
 * Puente con `WebBundlePlugin` (Java): bundle web actualizable sin APK.
 *
 * Solo existe en Android nativo. En web todo responde "no disponible" y la app
 * funciona como siempre (el navegador ya se actualiza al recargar).
 */
let _plugin = null

function plugin() {
  if (_plugin) return _plugin
  if (!Capacitor.isNativePlatform()) return null
  try {
    _plugin = registerPlugin('WebBundle')
  } catch {
    _plugin = null
  }
  return _plugin
}

/** Estado local: `{ activa, fallida, carpetas }` (versiones = versionCode). */
export async function estadoBundle() {
  const p = plugin()
  if (!p) return { activa: 0, fallida: 0, carpetas: [] }
  try {
    const res = await p.estado()
    return normalizar(res)
  } catch {
    return { activa: 0, fallida: 0, carpetas: [] }
  }
}

/**
 * Descarga y extrae un bundle. No lo activa: eso lo decide `activarBundle`.
 * `sha256` y `bytes` son opcionales pero recomendados.
 */
export async function descargarBundle({ url, sha256, bytes, version } = {}) {
  const p = plugin()
  if (!p) throw new Error('El bundle solo se puede actualizar en el dispositivo')
  const res = await p.descargar({
    url,
    sha256: sha256 || '',
    bytes: Number(bytes) || 0,
    version: Number(version) || 0
  })
  return normalizar(res)
}

/** Deja el bundle listo para el siguiente arranque (no recarga ahora). */
export async function activarBundle(version) {
  const p = plugin()
  if (!p) return null
  return normalizar(await p.activar({ version: Number(version) || 0 }))
}

/** Aplica ya y recarga la WebView (botón «Reiniciar ahora»). */
export async function aplicarBundleAhora(version) {
  const p = plugin()
  if (!p) return null
  return normalizar(await p.aplicarAhora({ version: Number(version) || 0 }))
}

/** Vuelve al bundle que viene dentro de la APK (recarga la WebView). */
export async function volverAlBundleDeLaApk() {
  const p = plugin()
  if (!p) return null
  return normalizar(await p.volverAApk())
}

/** Confirma que la app cargó: para el watchdog de arranques. */
export async function confirmarBundleListo() {
  const p = plugin()
  if (!p) return 0
  try {
    const res = await p.listo()
    return Number(res?.activa) || 0
  } catch {
    return 0
  }
}

/** Borra bundles viejos dejando el indicado. */
export async function limpiarBundles(conservar = 0) {
  const p = plugin()
  if (!p) return null
  try {
    return normalizar(await p.limpiar({ conservar: Number(conservar) || 0 }))
  } catch {
    return null
  }
}

/** Detiene la descarga en curso; el archivo parcial se conserva para reanudar. */
export async function cancelarDescargaBundle() {
  const p = plugin()
  if (!p) return false
  try {
    await p.cancelar()
    return true
  } catch {
    return false
  }
}

/** Progreso `{ fase, bytes, total, pct }`; devuelve la función para soltar. */
export async function escucharProgresoBundle(fn) {
  const p = plugin()
  if (!p || typeof fn !== 'function') return () => {}
  try {
    const handle = await p.addListener('progreso', fn)
    return () => handle.remove().catch(() => {})
  } catch {
    return () => {}
  }
}

function normalizar(res) {
  return {
    activa: Number(res?.activa) || 0,
    fallida: Number(res?.fallida) || 0,
    carpetas: Array.isArray(res?.carpetas) ? res.carpetas.map(Number).filter(Boolean) : []
  }
}
