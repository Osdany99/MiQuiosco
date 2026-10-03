/**
 * Cliente HTTP y matriz de autenticación para las pruebas de API.
 *
 * Habla contra un servidor Nitro real (`pnpm dev`) que apunte a la BD de
 * pruebas MiQuiosco_test. No usa fetch contra los handlers: el objetivo es
 * ejercitar la cadena completa (middleware de auth, rate limit, cabeceras,
 * validación Zod, Drizzle y Postgres), que es donde viven los bugs.
 *
 * Uso típico:
 *   const { api, jefe, trabajador, cliente } = await crearContexto()
 */

// `localhost` y no 127.0.0.1: en Windows `nuxt dev` escucha en ::1 (IPv6) salvo
// que se pase --host, y 127.0.0.1 da ECONNREFUSED.
const BASE = process.env.API_BASE_URL || 'http://localhost:3000'

/**
 * Nombre unico para fixtures. Lleva un contador ademas de la fecha: dos tests
 * pueden arrancar en el mismo milisegundo, y con solo Date.now() generarian el
 * mismo nombre; el segundo recibiria 409 y reutilizaria el fixture del primero
 * (que puede estar ya desactivado), produciendo fallos que parecen bugs.
 */
let seq = 0
export function nombreUnico(prefijo) {
  seq += 1
  // Con el PID: los archivos de test corren en procesos separados y dos
  // procesos pueden coincidir en ms y seq, generando el mismo nombre.
  return `${prefijo}_${Date.now()}_${process.pid}_${seq}`
}

/** Error de API con status y payload, para aserciones sobre 401/403/429/426. */
export class ApiError extends Error {
  constructor(status, statusMessage, data) {
    super(`${status} ${statusMessage}`)
    this.name = 'ApiError'
    this.status = status
    this.statusMessage = statusMessage
    this.data = data
  }
}

export function getBaseUrl() {
  return BASE
}

/**
 * Una petición cruda. No lanza por status: devuelve siempre
 * { status, body, headers } para que el test decida qué espera.
 */
export async function raw(method, path, { body, token, headers = {}, versionCode } = {}) {
  const h = { ...headers }
  if (body !== undefined) h['content-type'] = 'application/json'
  if (token) h.authorization = `Bearer ${token}`
  // El gate de versión mínima (426) solo dispara si el cliente envía el header.
  if (versionCode !== undefined) h['x-app-version-code'] = String(versionCode)

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: h,
    body: body === undefined ? undefined : JSON.stringify(body)
  })

  const text = await res.text()
  let parsed
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = text
  }
  return { status: res.status, body: parsed, headers: Object.fromEntries(res.headers) }
}

/** Igual que raw() pero lanza ApiError si el status no es el esperado. */
export async function call(method, path, opts = {}) {
  const { status: esperado, ...resto } = opts
  const r = await raw(method, path, resto)
  if (esperado !== undefined && r.status !== esperado) {
    throw new ApiError(
      r.status,
      r.body?.statusMessage ?? r.body?.message ?? JSON.stringify(r.body),
      r.body
    )
  }
  return r.body
}

export const get = (p, o) => call('GET', p, o)
export const post = (p, body, o = {}) => call('POST', p, { ...o, body })
export const patch = (p, body, o = {}) => call('PATCH', p, { ...o, body })
export const del = (p, o) => call('DELETE', p, o)

/**
 * Login real contra la BD de pruebas. Devuelve la respuesta completa.
 *
 * Aislamiento por IP: el rate limit de /api/auth/login son 5 intentos por IP y
 * ventana de 60s, leidos de x-forwarded-for. Si todos los tests compartieran la
 * IP 127.0.0.1 se expulsarian entre si con 429 y los fallos serian falsos, asi
 * que cada test usa una IP sintetica propia. El rate limit se sigue probando de
 * verdad, en loginEnSerial(), que usa una IP fija compartida a proposito.
 */
let contadorIp = 0

/** IP sintetica distinta por llamada, para no agotar la cuota compartida. */
export function ipDePrueba() {
  contadorIp += 1
  // 10.0.0.0/8 es rango privado: nunca colisiona con una IP real.
  return `10.99.${Math.floor(contadorIp / 250)}.${contadorIp % 250}`
}

export async function login(nombre_usuario, pin, extra = {}) {
  return raw('POST', '/api/auth/login', {
    body: { nombre_usuario, pin },
    headers: { 'x-forwarded-for': extra.ip ?? ipDePrueba() }
  })
}

/**
 * Login contra una IP EXPLICITA, sin aislamiento. La IP es obligatoria a
 * proposito: la cuota del rate limit se cuenta por IP, asi que compartir una
 * sin querer hace que un test agote la cuota de otro con 429 falsos (ya paso:
 * los tests de validacion 400 consumian la cuota de los tests de rate limit).
 */
export function loginEnSerial(nombre_usuario, pin, ip) {
  if (!ip) {
    throw new Error(
      'loginEnSerial exige IP explicita. Usa login() (IP propia por llamada) '
      + 'o pasa una IP dedicada al test.'
    )
  }
  return raw('POST', '/api/auth/login', {
    body: { nombre_usuario, pin },
    headers: { 'x-forwarded-for': ip }
  })
}

/**
 * Crea un jefe de pruebas y devuelve su token. Se usa cuando el seed no basta
 * (por ejemplo para probar el guard del último jefe, que necesita dos).
 */
export async function crearJefe(nombre, pin = '1234', rol = 'jefe') {
  const admin = await tokenJefe()
  if (!admin) {
    throw new Error(
      `crearJefe("${nombre}") necesita un token de jefe y no lo hay. `
      + 'El jefe del seed probably quedo desactivado o con rol cambiado.'
    )
  }
  const creado = await post('/api/usuarios', {
    nombre,
    rol,
    pin,
    activo: true
  }, { token: admin, status: 200 })
  const r = await loginConReintento(nombre, pin)
  return { usuario: creado, token: r.body.token, respuesta: r.body }
}

/**
 * Token del jefe del seed (jefe / 1234), o null si no se pudo.
 *
 * Devuelve null en vez de lanzar para que los tests puedan intentar reparar el
 * estado (un jefe en rol 'trabajador' no recibe token, y una corrida previa
 * puede haberlo dejado asi). Usar tokenJefeOError() cuando no haya repairs.
 */
export async function tokenJefe() {
  const r = await loginConReintento('jefe', '1234')
  return r.status === 200 ? r.body.token : null
}

/** Como tokenJefe() pero lanza con un mensaje accionable si no puede. */
export async function tokenJefeOError() {
  const t = await tokenJefe()
  if (!t) {
    throw new Error(
      'No se pudo iniciar sesión como jefe (jefe/1234). '
      + '¿La BD de pruebas está migrada y sembrada (pnpm db:migrate && pnpm db:seed '
      + 'con DATABASE_URL apuntando a MiQuiosco_test)? Si el jefe quedo con rol '
      + '\'trabajador\' por una corrida anterior, restaurarlo por SQL.'
    )
  }
  return t
}

/**
 * Login con espera activa ante el 429.
 *
 * El rate limit de /api/auth/login es de 5 intentos por IP y ventana de 60s, y
 * node --test corre los tests de un archivo en paralelo. Sin esto, los propios
 * tests de la suite se bloquean entre si y los fallos son ruido, no bugs.
 */
export async function loginConReintento(nombre_usuario, pin, intentos = 3) {
  for (let i = 0; i < intentos; i++) {
    const r = await login(nombre_usuario, pin)
    if (r.status !== 429) return r
    // Con IP aislada no deberia pasar; si pasa, es que el servidor no lee
    // x-forwarded-for y hay que revisarlo.
  }
  throw new Error(
    `No se pudo iniciar sesión como "${nombre_usuario}": el rate limit devolvió 429 `
    + 'aun usando una IP propia por test. Revisar que el server lea x-forwarded-for.'
  )
}

/**
 * Contexto completo de pruebas: tokens de jefe y trabajador, y el puesto.
 * Se llama una vez por archivo de test con node:test.
 */
export async function crearContexto() {
  const token = await tokenJefeOError()
  const me = await get('/api/usuarios', { token, status: 200 })
  const jefe = me.find(u => u.nombre === 'jefe')
  if (!jefe) throw new Error('El seed no creó el usuario jefe.')

  // El trabajador es opcional: si no existe, sus tests se saltan solos.
  let trabajador = null
  const existe = me.find(u => u.rol === 'trabajador')
  if (existe) {
    const r = await login(existe.nombre, '1234')
    trabajador = { usuario: existe, ...r.body }
  }

  return {
    api: { get, post, patch, del, call, raw },
    token,
    jefe,
    // El trabajador nunca recibe token (ver login.post.ts): solo sesión local.
    trabajadorToken: trabajador?.token ?? null,
    trabajador,
    puestoId: jefe.puestoId
  }
}

/**
 * Fixtures de apoyo. Los UUID son fijos para que los tests sean legibles y
 * los leftovers de una corrida no choquen con la siguiente.
 */
export const IDS = {
  producto: '550e8400-e29b-41d4-a716-4466554400a1',
  producto2: '550e8400-e29b-41d4-a716-4466554400a2',
  cliente: '550e8400-e29b-41d4-a716-4466554400b1',
  cuadre: '550e8400-e29b-41d4-a716-4466554400c1'
}

/** Crea un producto y devuelve su id (o el existente si ya está). */
export async function asegurarProducto(ctx, overrides = {}) {
  const payload = {
    nombre: overrides.nombre ?? `Prod ${IDS.producto.slice(-4)}`,
    precioVentaActual: overrides.precioVentaActual ?? 10,
    activo: true,
    activoQuiosco: true,
    ...overrides
  }
  const r = await raw('POST', '/api/productos', { body: payload, token: ctx.token })
  if (r.status === 200) return r.body.id
  if (r.status === 409) {
    const lista = await get('/api/productos', { token: ctx.token, status: 200 })
    const found = lista.find(p => p.nombre === payload.nombre)
    if (found) return found.id
  }
  throw new ApiError(r.status, r.body?.statusMessage ?? 'No se pudo crear el producto', r.body)
}

/**
 * Convierte una respuesta de error de h3 en el statusMessage legible.
 * h3 devuelve { statusCode, statusMessage, message, data }.
 */
export function mensajeDe(body) {
  return body?.statusMessage ?? body?.message ?? ''
}
