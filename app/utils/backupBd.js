/**
 * backupBd.js — Copia de seguridad de la base local a la carpeta Descargas.
 *
 * Existe porque el archivo de la base vive en el directorio interno `databases/`
 * de Android, al que el enum `Directory` de @capacitor/filesystem no llega
 * (no tiene valor para él, y las carpetas públicas están bloqueadas por scoped
 * storage con targetSdk 36). La copia la hace DbBackupPlugin, un plugin Java
 * propio registrado en MainActivity.
 *
 * Va en utils/ y no como composable porque lo usa un solo sitio (Configuración).
 */
import { Capacitor, registerPlugin } from '@capacitor/core'
import { useDb } from '../server-offline/db/client'

/**
 * Puente con `DbBackupPlugin` (Java, en android/app/src/main/java).
 * Mismo registro perezoso que appInstall.js: en web `registerPlugin` falla, así
 * que aquí se comprueba antes y en web la copia no hace nada.
 */
let _plugin = null

function plugin() {
  if (_plugin) return _plugin
  if (!Capacitor.isNativePlatform()) return null
  try {
    _plugin = registerPlugin('DbBackup')
  } catch {
    _plugin = null
  }
  return _plugin
}

/**
 * Crea una copia de seguridad de la base local y la deja en Descargas.
 *
 * Cierra la conexión antes de copiar y la reabre después, siempre. El cierre es
 * lo que garantiza que el archivo esté completo: con el WAL sin fusionar, la
 * copia se perdería de las últimas escrituras (ver cerrarParaCopia en db/client).
 *
 * @returns {Promise<{ruta: string, bytes: number}|null>} null en web, donde no
 *   hay archivo local que copiar.
 */
export async function crearCopiaBd() {
  if (!Capacitor.isNativePlatform()) return null

  const p = plugin()
  if (!p) throw new Error('La copia de seguridad solo está disponible en Android')

  const db = useDb()
  const copiada = await db.cerrarParaCopia()
  try {
    // En web cerrarParaCopia devuelve false y no hay nada que copiar.
    if (!copiada) return null
    return await p.exportar()
  } finally {
    // Aunque la copia falle, la app debe quedarse con la base abierta: si no,
    // el jefe vería cuadres en cero y gráficas vacías sin saber por qué.
    await db.reabrirTrasCopia().catch(() => {})
  }
}

/** Formatea el tamaño de la copia para mostrarlo en la UI. */
export function formatearBytes(bytes) {
  const n = Number(bytes) || 0
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
