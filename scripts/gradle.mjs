#!/usr/bin/env node
/**
 * scripts/gradle.mjs — Envoltorio de gradlew para los scripts de package.json.
 *
 * POR QUÉ EXISTE
 * El gradlew del proyecto Android es un shell script sin extensión; en Windows
 * hay que invocar gradlew.bat. Escribir `./gradlew` en un script de npm
 * fallaba con "'.' no se reconoce como comando". Este wrapper elige el
 * ejecutable correcto según la plataforma y propaga el código de salida.
 *
 * USO
 *   node scripts/gradle.mjs assembleDebug
 *   node scripts/gradle.mjs assembleRelease
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const ANDROID = join(RAIZ, 'android')

const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew'
const ruta = join(ANDROID, gradlew)
if (!existsSync(ruta)) {
  console.error(`No se encontró ${ruta}. ¿Android SDK configurado?`)
  process.exit(1)
}

/**
 * Busca un JDK si no hay JAVA_HOME.
 *
 * Android Studio trae su propio runtime (jbr) y es el JDK que corresponde a
 * este proyecto, pero no lo registra en el PATH ni en JAVA_HOME: sin esto,
 * gradlew falla con "JAVA_HOME is not set and no 'java' command could be
 * found" aunque el usuario tenga Android Studio instalado.
 */
function detectarJavaHome() {
  if (process.env.JAVA_HOME) return process.env.JAVA_HOME
  if (process.platform !== 'win32') return undefined

  const candidatos = [
    join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Android', 'Android Studio', 'jbr'),
    join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Android', 'Android Studio', 'jbr'),
    join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Android Studio', 'jbr'),
    join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Android', 'Android Studio', 'jre')
  ]
  return candidatos.find(c => c && existsSync(join(c, 'bin', 'java.exe')))
}

const tareas = process.argv.slice(2)
if (tareas.length === 0) {
  console.error('Uso: node scripts/gradle.mjs <tarea-gradle> [...]')
  process.exit(1)
}

// En Windows un .bat no se puede lanzar sin shell, así que hay pasar por cmd.
// Se arma un único comando con comillas porque el path del proyecto puede
// tener espacios ("Mis proyectos"), y se pasa como string — no como array de
// argumentos — para no activar el escapado de shell de Node.
const comanda = [`"${ruta}"`, ...tareas.map(t => `"${t}"`)].join(' ')

const javaHome = detectarJavaHome()
if (javaHome) {
  console.log(`JAVA_HOME: ${javaHome}`)
} else if (process.platform === 'win32') {
  console.warn('Aviso: no se encontró un JDK. Si gradlew falla, exportá JAVA_HOME.')
}

const hijo = spawn(comanda, {
  cwd: ANDROID,
  stdio: 'inherit',
  shell: true,
  env: javaHome ? { ...process.env, JAVA_HOME: javaHome } : process.env
})

hijo.on('error', (err) => {
  console.error('No se pudo ejecutar gradle:', err.message)
  process.exit(1)
})

hijo.on('exit', (codigo, senal) => {
  if (senal) {
    console.error(`Gradle terminado por señal ${senal}`)
    process.exit(1)
  }
  process.exit(codigo ?? 0)
})
