#!/usr/bin/env node
/**
 * scripts/pruebas/dispositivo.mjs — Errands de MiQuiosco sobre el driver adb.
 *
 * Cierra el pendiente 1.2 del plan: envuelve la skill `android-testing`
 * (`adb.py`, tratado como caja negra) con los valores del proyecto para que la
 * Fase 3 sea un comando y no una checklist manual.
 *
 * Uso:
 *   node scripts/pruebas/dispositivo.mjs <comando> [args]
 *
 * Comandos (serie 4d82ea9c, pkg com.myquiosco.app por defecto):
 *   devices                    lista dispositivos
 *   reverse [puerto]           adb reverse tcp:puerto tcp:puerto (def. 3000)
 *   instalar [apk]             install -r del APK debug
 *   lanzar                     monkey-launch del paquete
 *   detener                    force-stop del paquete
 *   captura [salida]           screencap PNG (def. .tmp/shot.png)
 *   ui [--find texto]          dump uiautomator o coordenadas de un texto
 *   logcat [--clear]           vuelca (o limpia) logcat
 *   crash-check                falla si hay FATAL EXCEPTION / AndroidRuntime
 *   sqlite-ls                  run-as ls databases (solo builds debug)
 *   sqlite-pull [destino]      copia miquioscoSQLite.db a local vía run-as cat
 *   estado                     devices + reverse --list + sqlite-ls (resumen)
 *   restaurar                  detener + logcat --clear (base conocida)
 *
 * Vars: ANDROID_SERIAL, APP_ID, APK_DEBUG, ADB_PY (ruta al driver de la skill).
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SERIAL = process.env.ANDROID_SERIAL || '4d82ea9c'
const PKG = process.env.APP_ID || 'com.myquiosco.app'
const DB = 'miquioscoSQLite.db'
const APK_DEF = join(RAIZ, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')

const ADB_PY_CANDIDATOS = [
  process.env.ADB_PY,
  'C:\\Users\\Osdany\\.opencode\\skills\\android-testing\\scripts\\adb.py',
  join(RAIZ, 'scripts', 'adb.py')
].filter(Boolean)
const ADB_PY = ADB_PY_CANDIDATOS.find(p => existsSync(p))
if (!ADB_PY) {
  console.error('No se encontró adb.py de la skill android-testing.')
  process.exit(2)
}

function adbBin() {
  const roots = [process.env.ANDROID_SDK_ROOT, process.env.ANDROID_HOME,
    join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk')].filter(Boolean)
  for (const r of roots) {
    const c = join(r, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb')
    if (existsSync(c)) return c
  }
  return 'adb'
}

function corre(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', ...opts })
  if (r.stdout) process.stdout.write(r.stdout)
  if (r.stderr) process.stderr.write(r.stderr)
  return r.status ?? 0
}

function viaDriver(args) {
  return corre('python', [ADB_PY, '--serial', SERIAL, ...args])
}

function ayuda() {
  console.log('Uso: node scripts/pruebas/dispositivo.mjs <devices|reverse|instalar|lanzar|detener|captura|ui|logcat|crash-check|sqlite-ls|sqlite-pull|estado|restaurar>')
}

const [cmd, ...rest] = process.argv.slice(2)
if (!cmd) {
  ayuda()
  process.exit(2)
}

let codigo = 0
switch (cmd) {
  case 'devices':
    codigo = corre('python', [ADB_PY, 'devices'])
    break
  case 'reverse': {
    const puerto = rest[0] || '3000'
    codigo = corre(adbBin(), ['-s', SERIAL, 'reverse', `tcp:${puerto}`, `tcp:${puerto}`])
    if (codigo === 0) console.log(`REVERSE tcp:${puerto} OK`)
    break
  }
  case 'instalar': {
    const apk = rest[0] || process.env.APK_DEBUG || APK_DEF
    if (!existsSync(apk)) {
      console.error(`APK no encontrada: ${apk}`)
      process.exit(1)
    }
    codigo = viaDriver(['install', apk])
    break
  }
  case 'lanzar':
    codigo = viaDriver(['launch', PKG])
    break
  case 'detener':
    codigo = viaDriver(['stop', PKG])
    break
  case 'captura': {
    const salida = rest[0] || join(RAIZ, '.tmp', 'shot.png')
    mkdirSync(dirname(salida), { recursive: true })
    codigo = viaDriver(['shot', salida])
    break
  }
  case 'ui':
    codigo = viaDriver(['ui', ...rest])
    break
  case 'logcat':
    codigo = viaDriver(['logcat', ...rest])
    break
  case 'crash-check':
    codigo = viaDriver(['crash-check'])
    break
  case 'sqlite-ls':
    codigo = viaDriver(['sqlite-ls', PKG])
    break
  case 'sqlite-pull': {
    // adb.py solo lista (ls); el volcado real es `run-as ... cat` por exec-out.
    const destino = rest[0] || join(RAIZ, '.tmp', DB)
    mkdirSync(dirname(destino), { recursive: true })
    const adb = adbBin()
    const r = spawnSync(adb,
      ['-s', SERIAL, 'exec-out', 'run-as', PKG, 'cat', `databases/${DB}`],
      { encoding: 'buffer' })
    if (r.status !== 0) {
      process.stderr.write((r.stderr || Buffer.alloc(0)).toString().slice(-2000))
      process.exit(1)
    }
    // exec-out puede anteponer \r\n; el SQLite empieza en el magic 'SQLite format 3\0'.
    let buf = Buffer.from(r.stdout || [])
    const magic = buf.indexOf(Buffer.from('SQLite format 3'))
    if (magic > 0) buf = buf.subarray(magic)
    const { writeFileSync } = await import('node:fs')
    writeFileSync(destino, buf)
    console.log(`PULL ${destino} (${buf.length} bytes)`)
    break
  }
  case 'estado': {
    codigo = corre('python', [ADB_PY, 'devices'])
    if (codigo !== 0) break
    codigo = corre(adbBin(), ['-s', SERIAL, 'reverse', '--list'])
    if (codigo !== 0) break
    codigo = viaDriver(['sqlite-ls', PKG])
    break
  }
  case 'restaurar':
    codigo = viaDriver(['stop', PKG])
    if (codigo !== 0) break
    codigo = viaDriver(['logcat', '--clear'])
    break
  default:
    ayuda()
    codigo = 2
}
process.exit(codigo)
