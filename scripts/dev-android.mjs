#!/usr/bin/env node
/**
 * scripts/dev-android.mjs — Deja la APK debug apuntando al dev server de la PC.
 *
 * POR QUÉ EXISTE
 * En desarrollo la APK no debe usar la IP LAN ni la URL horneada en el build:
 * el WebView carga directamente el dev server de Nuxt por `server.url`, y el
 * API viaja por `adb reverse` (el teléfono no necesita ver la IP de la PC ni
 * que el firewall de Windows abra el puerto). Así hay HMR y los cambios del
 * frontend se ven sin reinstalar.
 *
 * QUÉ HACE
 *   1. Verifica que `pnpm dev` responde en /api/health.
 *   2. `cap sync android` (salvo --no-sync): copia web + plugins + config.
 *   3. Parchea SOLO el config generado (gitignored): server.url y
 *      webContentsDebuggingEnabled. La config raíz no se toca, así que
 *      producción sigue igual.
 *   4. `assembleDebug` con el wrapper de Gradle (detecta JAVA_HOME).
 *   5. `adb install -r` sobre el dispositivo conectado.
 *   6. `adb reverse tcp:<puerto> tcp:<puerto>` y relanza la app.
 *
 * USO
 *   pnpm android:dev
 *   node scripts/dev-android.mjs --no-sync
 *   node scripts/dev-android.mjs --url http://127.0.0.1:3000
 *   node scripts/dev-android.mjs --target 4d82ea9c
 *
 * REQUISITOS
 *   - `pnpm dev` corriendo en otra terminal (puerto 3000 por defecto).
 *   - Dispositivo Android conectado con depuración activa.
 *   - Android SDK con platform-tools (adb).
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const ANDROID = join(RAIZ, 'android')
const CONFIG_PATH = join(ANDROID, 'app/src/main/assets/capacitor.config.json')
const APK_PATH = join(ANDROID, 'app/build/outputs/apk/debug/app-debug.apk')
const APP_ID = 'com.myquiosco.app'
const ACTIVITY = `${APP_ID}/.MainActivity`
const DEFAULT_URL = 'http://127.0.0.1:3000'

function ayuda() {
  console.log(`Uso: node scripts/dev-android.mjs [opciones]

Opciones:
  --url <url>        URL del dev server (por defecto ${DEFAULT_URL})
  --target <id>      ID del dispositivo adb (si hay más de uno)
  --no-sync          No correr cap sync (más rápido; útil si no cambió nada nativo)
  --no-debug         No activar webContentsDebuggingEnabled
  -h, --help         Mostrar esta ayuda`)
}

const argv = process.argv.slice(2)
const opts = {
  sync: true,
  debug: true,
  target: null,
  url: process.env.DEV_SERVER_URL || DEFAULT_URL
}

for (let i = 0; i < argv.length; i++) {
  const arg = argv[i]
  if (arg === '--no-sync') opts.sync = false
  else if (arg === '--no-debug') opts.debug = false
  else if (arg === '--target') opts.target = argv[++i]
  else if (arg === '--url') opts.url = argv[++i]
  else if (arg === '--help' || arg === '-h') {
    ayuda()
    process.exit(0)
  } else {
    console.error(`Opción desconocida: ${arg}`)
    ayuda()
    process.exit(1)
  }
}

let url
try {
  url = new URL(opts.url)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('protocolo')
} catch {
  console.error(`URL inválida: ${opts.url}`)
  process.exit(1)
}
const puerto = url.port || (url.protocol === 'https:' ? '443' : '80')

/** Ejecuta un comando con stdio heredado y espera a que termine. */
function run(cmd, args, { shell = false, cwd = RAIZ } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', shell, cwd })
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (signal) return reject(new Error(`El proceso terminó por ${signal}`))
      if (code === 0) return resolve()
      reject(new Error(`\`${cmd} ${args.join(' ')}\` salió con código ${code}`))
    })
  })
}

/** Ejecuta un comando y devuelve su stdout (para leer `adb devices`). */
function capturar(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => {
      out += d
    })
    child.stderr.on('data', (d) => {
      err += d
    })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) return resolve(out)
      reject(new Error(err.trim() || `\`${cmd} ${args.join(' ')}\` salió con código ${code}`))
    })
  })
}

/**
 * Busca adb en ANDROID_HOME/ANDROID_SDK_ROOT, en la carpeta estándar de
 * Android Studio y, si no, confía en el PATH.
 */
function detectarAdb() {
  const bin = process.platform === 'win32' ? 'adb.exe' : 'adb'
  const candidatos = []
  for (const base of [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT]) {
    if (base) candidatos.push(join(base, 'platform-tools', bin))
  }
  if (process.env.LOCALAPPDATA) {
    candidatos.push(join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', bin))
  }
  return candidatos.find(existsSync) || bin
}

const ADB = detectarAdb()

async function detectarDispositivo() {
  let salida
  try {
    salida = await capturar(ADB, ['devices', '-l'])
  } catch (err) {
    throw new Error(`No se pudo ejecutar adb (${ADB}). ¿Instalaste platform-tools? Detalle: ${err.message}`)
  }

  const lineas = salida.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const dispositivos = []
  const rechazados = []
  for (const linea of lineas) {
    if (linea.startsWith('List of devices')) continue
    const partes = linea.split(/\s+/)
    if (partes.length < 2) continue
    if (partes[1] === 'device') dispositivos.push(partes[0])
    else if (partes[1] === 'unauthorized') rechazados.push(partes[0])
  }

  if (rechazados.length) {
    throw new Error(`Dispositivo sin autorizar (${rechazados.join(', ')}). Acepta el diálogo de depuración en el teléfono.`)
  }
  if (!dispositivos.length) {
    throw new Error('No hay dispositivos adb conectados. Conecta el teléfono y activa la depuración USB.')
  }
  if (opts.target) {
    if (!dispositivos.includes(opts.target)) {
      throw new Error(`El dispositivo ${opts.target} no está conectado. Disponibles: ${dispositivos.join(', ')}`)
    }
    return opts.target
  }
  if (dispositivos.length > 1) {
    throw new Error(`Hay varios dispositivos (${dispositivos.join(', ')}). Usa --target <id>.`)
  }
  return dispositivos[0]
}

async function verificarDevServer() {
  const base = opts.url.replace(/\/+$/, '')
  try {
    const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(5000) })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Aviso amable si el dev server sirve un `syncServerUrl` distinto al origen
 * que usará el WebView. El API de la app sale del runtime config del dev
 * server (NUXT_PUBLIC_SYNC_SERVER_URL), no de `server.url`.
 */
async function revisarSyncServerUrl() {
  try {
    const base = opts.url.replace(/\/+$/, '')
    const res = await fetch(`${base}/`, { signal: AbortSignal.timeout(5000) })
    const html = await res.text()
    const m = html.match(/syncServerUrl:"([^"]*)"/)
    if (!m || !m[1]) return
    if (new URL(m[1]).origin !== url.origin) {
      console.warn(`Aviso: el dev server sirve syncServerUrl=${m[1]}, distinto del origen ${url.origin}.`)
      console.warn('Si el API no conecta, revisa NUXT_PUBLIC_SYNC_SERVER_URL en .env (debería ser http://127.0.0.1:3000).')
    }
  } catch {
    // El /api/health ya validó el servidor; esto es solo diagnóstico.
  }
}

/**
 * Parchea el config generado por Capacitor (no la config raíz).
 * `server.url` hace que el WebView cargue el dev server; el resto de campos
 * (appId, plugins, androidScheme) se conservan.
 */
function parchearConfig() {
  if (!existsSync(CONFIG_PATH)) {
    throw new Error(`No existe ${CONFIG_PATH}. Corre primero \`pnpm build\` y \`pnpm cap:sync\`.`)
  }
  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))
  config.server = { ...(config.server || {}), url: opts.url }
  config.android = {
    ...(config.android || {}),
    webContentsDebuggingEnabled: opts.debug
  }
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, '\t') + '\n')
  console.log(`Config generado parcheado: server.url = ${opts.url}`)
}

async function main() {
  console.log(`Dispositivo: ${await detectarDispositivo()}`)

  if (!(await verificarDevServer())) {
    console.error(`El dev server no responde en ${opts.url}/api/health.`)
    console.error('Arráncalo en otra terminal con: pnpm dev')
    process.exit(1)
  }
  console.log(`Dev server OK: ${opts.url}`)
  await revisarSyncServerUrl()

  if (opts.sync) {
    if (!existsSync(join(RAIZ, '.output/public/index.html'))) {
      console.error('Falta .output/public/index.html. Corre `pnpm build` antes de continuar.')
      process.exit(1)
    }
    console.log('Sincronizando Capacitor (cap sync android)...')
    await run('pnpm', ['exec', 'cap', 'sync', 'android'], { shell: true })
  }

  parchearConfig()

  console.log('Compilando APK debug (assembleDebug)...')
  await run(process.execPath, [join(RAIZ, 'scripts/gradle.mjs'), 'assembleDebug'])

  if (!existsSync(APK_PATH)) {
    throw new Error(`No se generó ${APK_PATH}`)
  }

  console.log('Instalando APK en el dispositivo...')
  try {
    await run(ADB, ['install', '-r', APK_PATH])
  } catch (err) {
    console.error(`No se pudo instalar: ${err.message}`)
    console.error(`Si el teléfono tiene la APK de release instalada, desinstálala primero:`)
    console.error(`  ${ADB} uninstall ${APP_ID}`)
    process.exit(1)
  }

  console.log(`Reenviando puerto ${puerto} (adb reverse)...`)
  await run(ADB, ['reverse', `tcp:${puerto}`, `tcp:${puerto}`])

  console.log('Reiniciando la app...')
  await run(ADB, ['shell', 'am', 'force-stop', APP_ID])
  await run(ADB, ['shell', 'am', 'start', '-n', ACTIVITY])

  console.log('')
  console.log('Listo. La APK ahora carga el dev server desde la PC.')
  console.log(`  URL:      ${opts.url}`)
  console.log(`  Dispositivo: ${await detectarDispositivo()}`)
  console.log('  Si desconectas el USB, vuelve a correr `pnpm android:dev` (o solo')
  console.log(`  \`${ADB} reverse tcp:${puerto} tcp:${puerto}\`) para reactivar el reenvío.`)
}

main().catch((err) => {
  console.error('')
  console.error(`Error: ${err.message}`)
  process.exit(1)
})
