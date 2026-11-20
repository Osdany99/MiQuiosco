import { Capacitor, registerPlugin } from '@capacitor/core'

/**
 * Puente con `VoskModeloPlugin` (Java): aprovisiona el modelo de voz offline
 * (descarga reanudable con sha256 o importación desde un archivo).
 *
 * El modelo NO viaja dentro de la APK: eran 38 de los 57 MB de cada
 * actualización. Solo existe en Android nativo; en web todo responde "no
 * disponible" y la app sigue usando el reconocedor del navegador.
 */
let _plugin = null

function plugin() {
  if (_plugin) return _plugin
  if (!Capacitor.isNativePlatform()) return null
  try {
    _plugin = registerPlugin('VoskModelo')
  } catch {
    _plugin = null
  }
  return _plugin
}

/** Estado local del modelo: { listo, disponible, bytes, version }. */
export async function estadoModelo() {
  const p = plugin()
  if (!p) return { listo: false, disponible: false, bytes: 0, version: '' }
  try {
    const res = await p.estado()
    return {
      listo: res?.listo === true,
      disponible: res?.disponible === true,
      bytes: Number(res?.bytes) || 0,
      version: res?.version ? String(res.version) : ''
    }
  } catch {
    return { listo: false, disponible: false, bytes: 0, version: '' }
  }
}

/**
 * Descarga el modelo desde `url` y lo deja descomprimido.
 * `sha256` y `bytes` son opcionales pero recomendados: sin ellos no se puede
 * detectar un ZIP corrupto hasta que falla Vosk.
 */
export async function descargarModelo({ url, sha256, bytes, version } = {}) {
  const p = plugin()
  if (!p) throw new Error('El modelo solo se puede preparar en el dispositivo')
  return p.descargar({
    url,
    sha256: sha256 || '',
    bytes: Number(bytes) || 0,
    version: version || ''
  })
}

/** Detiene una descarga en curso; el archivo parcial se conserva para reanudar. */
export async function cancelarDescarga() {
  const p = plugin()
  if (!p) return false
  try {
    await p.cancelar()
    return true
  } catch {
    return false
  }
}

/** Red de seguridad sin red: elegir el ZIP del modelo desde USB/SD. */
export async function importarModelo() {
  const p = plugin()
  if (!p) throw new Error('El modelo solo se puede importar en el dispositivo')
  return p.importar()
}

/** Borra modelo, ZIP y descarga parcial (soporte / liberar espacio). */
export async function borrarModelo() {
  const p = plugin()
  if (!p) return null
  try {
    return await p.borrar()
  } catch {
    return null
  }
}

/**
 * Anota la versión del modelo ya extraído sin descargarlo (equipos que lo
 * traían dentro de la APK vieja).
 */
export async function marcarVersionModelo(version) {
  const p = plugin()
  if (!p || !version) return null
  try {
    return await p.marcar({ version: String(version) })
  } catch {
    return null
  }
}

/**
 * Escucha el progreso de la descarga/extracción: { fase, bytes, total, pct }.
 * Devuelve la función para dejar de escuchar.
 */
export async function escucharProgreso(fn) {
  const p = plugin()
  if (!p || typeof fn !== 'function') return () => {}
  try {
    const handle = await p.addListener('progreso', fn)
    return () => handle.remove().catch(() => {})
  } catch {
    return () => {}
  }
}
