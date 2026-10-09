/**
 * Runner de las pruebas de API.
 *
 * Levanta una BD de pruebas limpia (MiQuiosco_test), arranca `nuxt dev` contra
 * ella y ejecuta las suites en dos grupos:
 *
 *   1. Paralelas (auth.test.js): solo leen o crean sus propios datos.
 *   2. Secuenciales, un archivo por invocacion: saturan el rate limit o
 *      desactivan jefes (estado global). Pasar dos archivos al mismo
 *      `node --test` los hace correr en paralelo y se pisan.
 *
 * Portable Windows/Linux (el CI corre en ubuntu): la administracion de la BD se
 * hace con node-postgres (dependencia del proyecto), no con el binario psql, y
 * los subprocesos se lanzan con `shell: true` en vez de cmd.exe.
 *
 * Uso:  node tests/api/run.mjs
 * Variables de entorno que respeta:
 *   API_BASE_URL  - si ya hay un server corriendo, lo usa y no levanta otro
 *   KEEP_DB=1     - no recrea la BD de pruebas (para iterar rapido)
 *   DATABASE_URL  - si viene puesta, se usa como base (se cambia el nombre a
 *                   MiQuiosco_test); si no, se lee del .env
 */
import { spawn, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import pg from 'pg'
import { loginConReintento } from './cliente.js'
import { restaurarJefe } from './db-directa.js'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const API = process.env.API_BASE_URL || 'http://localhost:3000'
const ES_WIN = process.platform === 'win32'

function log(t) {
  console.log(`\x1b[36m[api]\x1b[0m ${t}`)
}

// --- URL de la BD de pruebas ---
function leerEnv() {
  const env = {}
  for (const linea of readFileSync(join(RAIZ, '.env'), 'utf8').split('\n')) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return env
}

const baseUrl = process.env.DATABASE_URL || leerEnv().DATABASE_URL || ''
if (!baseUrl) {
  console.error('No hay DATABASE_URL: ni en el entorno ni en .env.')
  process.exit(1)
}
const urlBdPruebas = baseUrl.replace(/\/[^/]+(\?.*)?$/, '/MiQuiosco_test$1')

// El propio runner tambien usa la BD de pruebas (recuperarSeed() llama a
// db-directa.js). Sin esto, esas llamadas leerian el .env y tocarian la BD real.
process.env.DATABASE_URL = urlBdPruebas

/** Conexion administrativa (a postgres) para crear/borrar la BD de pruebas. */
async function conAdmin(fn) {
  const adminUrl = urlBdPruebas.replace(/\/[^/]+(\?.*)?$/, '/postgres$1')
  const client = new pg.Client({ connectionString: adminUrl })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

// --- Preparar la BD de pruebas ---
if (!process.env.API_BASE_URL && process.env.KEEP_DB !== '1') {
  log('recreando MiQuiosco_test...')
  await conAdmin(async (c) => {
    // DROP DATABASE falla si queda alguna sesion conectada (por ejemplo un
    // server de la corrida anterior), asi que primero se cortan.
    // El nombre con mayusculas va citado: sin comillas Postgres lo pliega a
    // minusculas y la URL de conexion (que no lo pliega) no lo encontraria.
    await c.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity '
      + 'WHERE datname = \'MiQuiosco_test\' AND pid <> pg_backend_pid();'
    )
    await c.query('DROP DATABASE IF EXISTS "MiQuiosco_test";')
    await c.query('CREATE DATABASE "MiQuiosco_test";')
  })

  const env = { ...process.env, DATABASE_URL: urlBdPruebas }
  log('aplicando migraciones...')
  const mig = spawnSync('pnpm', ['db:migrate'], {
    cwd: RAIZ, env, stdio: 'inherit', shell: true
  })
  if (mig.status !== 0) {
    console.error('Fallaron las migraciones.')
    process.exit(1)
  }
  log('sembrando...')
  const seed = spawnSync('pnpm', ['db:seed'], {
    cwd: RAIZ, env, stdio: 'inherit', shell: true
  })
  if (seed.status !== 0) {
    console.error('Falló el seed.')
    process.exit(1)
  }
}

/**
 * Espera a que el server responda /api/health.
 *
 * 180 intentos y no 60: en frío, `nuxt dev` tarda 25-60 s solo en construir el
 * bundle de Nitro. Con 60 el runner de CI (más lento que un PC) se quedaba sin
 * margen y daba "El server no levanto" cuando en realidad iba por la mitad.
 */
async function esperarServidor(intentos = 180) {
  for (let i = 0; i < intentos; i++) {
    try {
      const r = await fetch(`${API}/api/health`)
      if (r.ok) return true
    } catch { /* aun no levanta */ }
    await new Promise(r => setTimeout(r, 1000))
  }
  return false
}

/**
 * Red de seguridad: si una corrida anterior dejo al jefe del seed con otro rol
 * (un test que lo degrada y no restaura), tokenJefe() devolveria null y TODAS
 * las suites fallarian con "no autenticado". El seed solo crea al jefe si no
 * existe, asi que no lo corrige; se corrige por SQL.
 */
async function recuperarSeed() {
  const token = await loginConReintento('jefe', '1234').catch(() => ({ status: 0 }))
  if (token.status === 200 && token.body.token) return 'ok'
  await restaurarJefe('00000000-0000-0000-0000-000000000001')
  const reintento = await loginConReintento('jefe', '1234').catch(() => ({ status: 0 }))
  return reintento.status === 200 ? 'recuperado' : 'FALLO'
}

/**
 * PID escuchando en localhost:PUERTO, o null. En Windows un `servidor.kill()`
 * solo mata el cmd.exe y deja huerfano el proceso nuxt: sin esto, la proxima
 * corrida cree levantar un server nuevo, el puerto sigue ocupado por el
 * huerfano, el health-check pasa contra el VIEJO y los tests corren contra
 * codigo y BD viejos (asi se contamino la BD real en una ocasion).
 */
function pidEnPuerto(puerto) {
  try {
    const r = spawnSync(
      'powershell.exe',
      ['-NoProfile', '-Command',
        `(Get-NetTCPConnection -LocalPort ${puerto} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess`],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    )
    const n = Number((r.stdout || '').trim())
    return Number.isInteger(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

function liberarPuerto(puerto) {
  const pid = pidEnPuerto(puerto)
  if (pid == null) return
  log(`puerto ${puerto} ocupado por PID ${pid}: se libera (huerfano de corrida anterior)`)
  if (ES_WIN) {
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' })
  } else {
    try {
      process.kill(pid, 'SIGKILL')
    } catch { /* ya murio */ }
  }
}

async function esperarPuertoLibre(puerto, intentos = 10) {
  for (let i = 0; i < intentos; i++) {
    if (pidEnPuerto(puerto) == null) return true
    await new Promise(r => setTimeout(r, 500))
  }
  return false
}

// --- Arrancar el server si hace falta ---
let servidor = null
if (!process.env.API_BASE_URL) {
  liberarPuerto(3000)
  log('arrancando nuxt dev...')
  servidor = spawn('pnpm', ['dev'], {
    cwd: RAIZ,
    env: { ...process.env, DATABASE_URL: urlBdPruebas },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
    detached: !ES_WIN
  })
  const logErr = []
  servidor.stderr.on('data', d => logErr.push(d.toString()))
  servidor.stdout.on('data', () => {})
  if (!(await esperarServidor())) {
    console.error('El server no levanto. stderr:\n', logErr.join('').slice(-2000))
    matarServidor()
    process.exit(1)
  }
  log('server listo')
}

function matarServidor() {
  if (!servidor) return
  try {
    if (ES_WIN) {
      // En Windows no hay grupos de procesos: taskkill tumba el arbol entero.
      spawnSync('taskkill', ['/pid', String(servidor.pid), '/T', '/F'], { stdio: 'ignore' })
    } else {
      process.kill(-servidor.pid)
    }
  } catch {
    try {
      servidor.kill()
    } catch { /* ya murio */ }
  }
}

function correr(archivos) {
  const r = spawnSync(
    process.execPath,
    ['--test', ...archivos.map(a => join(RAIZ, 'tests/api', a))],
    {
      cwd: RAIZ,
      stdio: 'inherit',
      // DATABASE_URL se propaga para que db-directa.js opere sobre la BD de
      // pruebas y nunca sobre la real (ver el comentario en urlBdPruebas()).
      env: { ...process.env, API_BASE_URL: API, DATABASE_URL: urlBdPruebas }
    }
  )
  return r.status
}

/**
 * Corre UN archivo por invocacion. Necesario para los tests que mutan estado
 * global: pasar dos archivos al mismo `node --test` los hace correr en paralelo
 * (--test-concurrency controla cuantos, pero >1 corre simultaneamente), y se
 * pisan. Separarlos garantiza que solo hay un actor a la vez.
 */
function correrSecuencial(archivos) {
  let peor = 0
  for (const a of archivos) {
    const r = spawnSync(
      process.execPath,
      ['--test', join(RAIZ, 'tests/api', a)],
      {
        cwd: RAIZ,
        stdio: 'inherit',
        env: { ...process.env, API_BASE_URL: API, DATABASE_URL: urlBdPruebas }
      }
    )
    if (r.status !== 0) peor = r.status
  }
  return peor
}

// --- Suite 1: paralelas (no tocan el estado global de jefes) ---
const estadoSeed = await recuperarSeed()
if (estadoSeed !== 'ok') {
  console.error(`No se pudo iniciar sesión como jefe (${estadoSeed}). `
    + 'Revisar el seed de MiQuiosco_test antes de seguir.')
  matarServidor()
  process.exit(1)
}

// --solo=<frag>: corre solo los archivos que contengan el fragmento (para
// iterar una suite sin levantar todo dos veces). Ej: node tests/api/run.mjs
// --solo=webauthn  |  KEEP_DB=1 node tests/api/run.mjs --solo=sync
const solo = (process.argv.find(a => a.startsWith('--solo=')) ?? '').slice('--solo='.length)

log('suite paralela...')
const paralelas = ['auth.test.js', 'puesto.test.js', 'sync.test.js', 'webauthn-ratelimit.test.js', 'transaccional.test.js', 'crud.test.js']
  .filter(a => !solo || a.includes(solo))
const r1 = correr(paralelas)

// --- Suite 2: secuenciales (saturan el rate limit o desactivan jefes) ---
// Un archivo por invocacion: comparten estado global y no pueden correr a la vez.
log('suite secuencial (un archivo a la vez)...')
const r2 = correrSecuencial(
  ['auth-secuencial.test.js', 'usuarios-guardas.test.js'].filter(a => !solo || a.includes(solo))
)

matarServidor()
if (await esperarPuertoLibre(3000)) {
  log('server detenido')
} else {
  // No se deja un huerfano atras: la proxima corrida testearia contra el.
  console.error('El puerto 3000 sigue ocupado tras matar el server. '
    + 'Liberenlo a mano antes de la proxima corrida.')
  process.exit(1)
}

process.exit(r1 === 0 && r2 === 0 ? 0 : 1)
