/**
 * shared/web/bundle.js — Decisión de aplicar o no un bundle web descargado.
 *
 * El bundle web (HTML/JS/CSS de Nuxt, ~1 MB comprimido) puede actualizarse sin instalar la
 * APK. El número de versión es el `versionCode` del release que lo generó, así
 * que "la versión que corre" se compara siempre en la misma escala:
 *
 * - `embebida`: versionCode de la APK instalada. Es la versión del bundle que
 *   viene dentro de la APK.
 * - `instalada`: versión del bundle OTA activo (0 si se está usando el de la
 *   APK).
 *
 * `apkMinima` es el versionCode de la APK más vieja con la que ese bundle es
 * compatible: sube solo cuando cambia algo nativo (un plugin, un permiso). Un
 * bundle con `apkMinima` mayor que la APK instalada se ignora; el equipo tiene
 * que actualizar la APK primero.
 *
 * Sin Vue, sin Capacitor y sin base de datos: se prueba con `node --test`.
 */

/** ¿Qué hacer con el bundle que publica el manifiesto? */
export const ACCION = Object.freeze({
  NADA: 'nada',
  DESCARGAR: 'descargar',
  APK_PRIMERO: 'apk_primero'
})

/**
 * @param {object} opciones
 * @param {number} [opciones.embebida]  versionCode de la APK instalada
 * @param {number} [opciones.instalada] versionCode del bundle OTA activo (0 = ninguno)
 * @param {number} [opciones.fallida]   versión OTA que no arrancó (se evita)
 * @param {object|null} [opciones.remoto] bloque `web` del manifiesto
 * @returns {{ accion: string, version: number }}
 */
export function decidirBundle({ embebida = 0, instalada = 0, fallida = 0, remoto = null } = {}) {
  const apk = numero(embebida)
  const ota = numero(instalada)
  const rota = numero(fallida)

  if (!remoto || typeof remoto !== 'object') {
    return { accion: ACCION.NADA, version: 0 }
  }

  const version = numero(remoto.version)
  if (version <= 0 || !remoto.url) {
    return { accion: ACCION.NADA, version: 0 }
  }

  const minima = numero(remoto.apkMinima)
  if (minima > 0 && apk > 0 && apk < minima) {
    return { accion: ACCION.APK_PRIMERO, version }
  }

  // La APK ya trae una versión igual o más nueva (típico tras actualizarla):
  // no hay nada que bajar y el OTA viejo sobra.
  if (version <= Math.max(apk, ota)) {
    return { accion: ACCION.NADA, version }
  }

  // Esa versión ya falló al arrancar: no se vuelve a bajar. Se espera a la
  // siguiente (el manifiesto publica un número nuevo).
  if (rota > 0 && version === rota) {
    return { accion: ACCION.NADA, version }
  }

  return { accion: ACCION.DESCARGAR, version }
}

/**
 * Versión que está corriendo ahora mismo: la OTA si es más nueva que la de la
 * APK, si no la embebida.
 */
export function versionEnUso({ embebida = 0, instalada = 0 } = {}) {
  const apk = numero(embebida)
  const ota = numero(instalada)
  return ota > apk ? ota : apk
}

/** ¿El OTA activo quedó obsoleto por una APK más nueva? Hay que limpiarlo. */
export function otaObsoleto({ embebida = 0, instalada = 0 } = {}) {
  const apk = numero(embebida)
  const ota = numero(instalada)
  return ota > 0 && ota <= apk
}

function numero(valor) {
  const n = Math.trunc(Number(valor))
  return Number.isFinite(n) && n > 0 ? n : 0
}
