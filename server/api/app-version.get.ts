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
    apkUrl: process.env.APP_APK_URL || '/apk/miquiosco-v1.0.apk',
    changelog: process.env.APP_CHANGELOG || '',
    metodoSugerido: process.env.APP_METODO_SUGERIDO || 'navegador'
  }
})
