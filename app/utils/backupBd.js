/**
 * backupBd.js — Copia de seguridad y restauración de la base local.
 *
 * Existe porque el archivo de la base vive en el directorio interno `databases/`
 * de Android, al que el enum `Directory` de @capacitor/filesystem no llega
 * (no tiene valor para él, y las carpetas públicas están bloqueadas por scoped
 * storage con targetSdk 36). La copia la hace DbBackupPlugin, un plugin Java
 * propio registrado en MainActivity.
 *
 * Va en utils/ y no como composable porque lo usa un solo sitio (Configuración).
 *
 * OJO con el nombre del archivo: la conexión se abre como 'miquiosco', pero
 * @capacitor-community/sqlite guarda el archivo en databases/ como
 * 'miquioscoSQLite.db' (le añade el sufijo). Si el nombre cambia aquí, hay que
 * cambiarlo también en DbBackupPlugin.java (ARCHIVO_BD).
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

// ------------------------------------------------------- restauración ----

/**
 * Abre el selector de archivos para elegir una copia de la base.
 *
 * NO toca la base: el plugin deja el archivo validado en la caché y devuelve un
 * resumen (cuadres, productos, rango de fechas) para que el jefe confirme que
 * es el archivo que cree. Cancelar no es un error: devuelve `{ cancelado: true }`.
 *
 * @returns {Promise<{cancelado:boolean}|{bytes:number, cuadres:number, productos:number,
 *   movimientos:number, desde:string, hasta:string}|null>} null en web.
 */
export async function elegirCopiaParaRestaurar() {
  if (!Capacitor.isNativePlatform()) return null

  const p = plugin()
  if (!p) throw new Error('La restauración solo está disponible en Android')

  return await p.elegirCopia()
}

/**
 * Sustituye la base local por la copia elegida.
 *
 * Cierra la conexión ANTES y no la reabre: el archivo que se va a tocar es
 * justo el que SQLite tiene abierto. Quien llama debe recargar la página
 * después (ver Ajustes), que es lo que reabre la base y aplica las
 * migraciones que le falten a la copia.
 *
 * El plugin deja antes una copia del estado actual en Descargas, así que un
 * archivo equivocado tiene vuelta atrás.
 *
 * @returns {Promise<{bytes:number, respaldo:string}|null>} null en web.
 */
export async function restaurarCopiaBd() {
  if (!Capacitor.isNativePlatform()) return null

  const p = plugin()
  if (!p) throw new Error('La restauración solo está disponible en Android')

  const db = useDb()
  // Lanza si hay una transacción en curso: cerrarle encima la abortaría.
  const cerrada = await db.cerrarParaCopia()
  if (!cerrada) return null

  try {
    // Sin reabrir al terminar: la conexión no debe volver a abrirse sobre el
    // archivo recién sustituido. Quien llama recarga la página después, que es
    // lo que reabre la base y aplica las migraciones que falten.
    return await p.aplicarCopia()
  } catch (err) {
    // Si la sustitución falló, el archivo viejo sigue en su sitio pero la
    // conexión está cerrada: se reabre para no dejar la app inservible y sin
    // tener que pedirle al jefe que reinicie.
    await db.reabrirTrasCopia().catch(() => {})
    throw err
  }
}
