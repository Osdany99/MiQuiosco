/**
 * GET /api/app-version — Manifiesto público de versiones de la APK.
 *
 * Lo consume `useAppUpdate` (solo Android nativo) para decidir si hay
 * actualización disponible y si es opcional u obligatoria:
 * - instalada < minVersionCode   → obligatoria (bloquea la app)
 * - instalada < latestVersionCode → opcional (descartable)
 *
 * Los valores salen de variables de entorno para poder publicar una
 * versión sin tocar código (ver `docs/PUBLICAR_VERSION.md`).
 * `metodoSugerido` indica el modo de entrega preferido ('navegador' |
 * 'interno' | 'automatico'); el cliente puede sobreescribirlo en ajustes.
 *
 * `vozModelo` describe el ZIP del modelo Vosk que el APK descarga aparte
 * (ya no viaja dentro de la APK: eran 38 de los 57 MB de cada actualización).
 * `useVozModelo` lo usa para descargar, reanudar y verificar el archivo. Si
 * `url` viene vacío (modelo aún no publicado), la app informa que no está
 * disponible en vez de intentar una descarga rota.
 *
 * `web` describe el bundle web (HTML/JS/CSS, ~1 MB comprimido) que la app puede
 * actualizar sin instalar la APK. `version` es el versionCode del release que
 * lo generó y `apkMinima` el versionCode de la APK más vieja compatible: si el
 * equipo está por debajo, el bundle se ignora y se le ofrece la APK.
 */
export default defineEventHandler(() => {
  const num = (raw: string | undefined, fallback: number): number => {
    const n = Number(raw)
    return raw != null && raw !== '' && Number.isFinite(n) ? n : fallback
  }

  return {
    latestVersionCode: num(process.env.APP_LATEST_VERSION_CODE, 1),
    latestVersionName: process.env.APP_LATEST_VERSION_NAME || '1.0',
    minVersionCode: num(process.env.APP_MIN_VERSION_CODE, 0),
    apkUrl: process.env.APP_APK_URL || '/apk/miquiosco-v1.1.apk',
    changelog: process.env.APP_CHANGELOG || '',
    metodoSugerido: process.env.APP_METODO_SUGERIDO || 'navegador',
    vozModelo: {
      url: process.env.APP_VOSK_URL || '',
      sha256: process.env.APP_VOSK_SHA256 || '',
      bytes: num(process.env.APP_VOSK_BYTES, 0),
      version: process.env.APP_VOSK_VERSION || ''
    },
    web: {
      version: num(process.env.APP_WEB_VERSION, 0),
      apkMinima: num(process.env.APP_WEB_APK_MINIMA, 0),
      url: process.env.APP_WEB_URL || '',
      sha256: process.env.APP_WEB_SHA256 || '',
      bytes: num(process.env.APP_WEB_BYTES, 0)
    }
  }
})
