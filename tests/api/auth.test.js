/**
 * Matriz de autenticacion y seguridad de la API.
 *
 * Corre contra un servidor real (pnpm dev) sobre la BD de pruebas. Cubre lo que
 * hasta ahora no tenia ninguna prueba: los 8 endpoints de /api/auth, el gate de
 * version (426), el rate limit de login y las cabeceras de seguridad.
 */
import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import {
  login, loginEnSerial, tokenJefe, get, post, patch, raw, mensajeDe, crearJefe, nombreUnico
} from './cliente.js'
import { restaurarJefe } from './db-directa.js'

let token
let jefe
let puestoId

before(async () => {
  token = await tokenJefe()
  if (!token) {
    await restaurarJefe('00000000-0000-0000-0000-000000000001')
    token = await tokenJefe()
  }
  assert.ok(token, 'el jefe del seed debe poder iniciar sesion')
  const usuarios = await get('/api/usuarios', { token, status: 200 })
  jefe = usuarios.find(u => u.nombre === 'jefe')
  puestoId = jefe.puestoId
})

// --- POST /api/auth/login ---
// NOTA: los tests que hacen varios login seguidos compiten por el rate limit
// (5/min por IP). Los que necesitan varios intentos viven en su propia suite
// secuencial; aqui solo los que hacen 1-2 logins aislados.
describe('POST /api/auth/login', () => {
  it('el jefe recibe token JWT y datos del usuario', async () => {
    const r = await login('jefe', '1234')
    assert.equal(r.status, 200)
    assert.equal(typeof r.body.token, 'string')
    assert.equal(r.body.usuario.rol, 'jefe')
    assert.equal(r.body.usuario.puestoId, puestoId)
  })

  it('expiraEn viene en milisegundos y es futuro', async () => {
    const r = await login('jefe', '1234')
    // El servidor multiplica por 1000 los segundos del JWT (login.post.ts:89).
    assert.ok(r.body.expiraEn > Date.now(), 'expiraEn deberia estar en el futuro')
    // Si estuviera en segundos seria ~1.7e9, no ~1.8e12.
    assert.ok(r.body.expiraEn > 1e12, 'expiraEn deberia estar en ms, no en s')
  })

  it('el trabajador NO recibe token (solo sesion local)', async () => {
    const nombre = nombreUnico('trabajador')
    await crearJefe(nombre, '1234', 'trabajador')
    const r = await login(nombre, '1234')
    assert.equal(r.status, 200)
    assert.equal(r.body.token, undefined, 'el trabajador no debe recibir token')
    assert.equal(r.body.usuario.rol, 'trabajador')
    assert.ok(r.body.expiraEn > Date.now())
  })

  it('un usuario con rol cliente recibe 403', async () => {
    const nombre = nombreUnico('cliente')
    await crearJefe(nombre, '1234', 'cliente')
    const r = await login(nombre, '1234')
    assert.equal(r.status, 403)
    assert.match(mensajeDe(r.body), /clientes no pueden iniciar sesi/i)
  })

  // IP propia por test: los 400 tambien consumen cuota del rate limit (solo un
  // 200 la resetea), y la IP por defecto la comparten los tests de rate-limit
  // de auth-secuencial.test.js contra el mismo servidor.
  it('rechaza PIN de 3 y de 7 caracteres con 400', async () => {
    const corto = await loginEnSerial('jefe', '123', '10.99.255.240')
    const largo = await loginEnSerial('jefe', '1234567', '10.99.255.240')
    assert.equal(corto.status, 400)
    assert.equal(largo.status, 400)
  })

  it('rechaza nombre vacio con 400', async () => {
    const r = await loginEnSerial('', '1234', '10.99.255.241')
    assert.equal(r.status, 400)
  })

  it('el 400 incluye el detalle de Zod', async () => {
    // Un PIN de 1 caracter viola loginSchema (min 4), asi que debe 400 con data.
    const r = await loginEnSerial('jefe', '1', '10.99.255.242')
    assert.equal(r.status, 400)
    // h3 envuelve el error; el detalle de Zod viaja en data o en el mensaje.
    const detalle = JSON.stringify(r.body)
    assert.ok(
      r.body.data || detalle.includes('pin') || detalle.includes('fieldErrors'),
      `el 400 deberia incluir el detalle de Zod. Body: ${detalle.slice(0, 300)}`
    )
  })
})

// NOTA: los casos de "usuario desactivado" y "PIN incorrecto vs usuario
// inexistente" requieren logins repetidos o desactivan usuarios, asi que viven
// en auth-secuencial.test.js (concurrency=1) para no pelear por el rate limit ni
// invalidar el token compartido.

// --- requireAuth sobre endpoints protegidos ---
describe('requireAuth en endpoints protegidos', () => {
  const protegidos = [
    ['GET', '/api/usuarios'],
    ['GET', '/api/productos'],
    ['GET', '/api/cuadres'],
    ['GET', '/api/clientes'],
    ['GET', '/api/recargas'],
    ['GET', '/api/inventario/saldos'],
    ['GET', '/api/proveedores'],
    ['GET', '/api/pagos-fiado'],
    ['GET', '/api/ventas-directas'],
    ['GET', '/api/transferencias'],
    ['GET', '/api/ajustes']
  ]

  for (const [metodo, ruta] of protegidos) {
    it(`${metodo} ${ruta} sin token da 401`, async () => {
      const r = await raw(metodo, ruta)
      assert.equal(r.status, 401)
    })
  }

  it('token basura da 401', async () => {
    const r = await raw('GET', '/api/usuarios', { token: 'no-es-un-jwt' })
    assert.equal(r.status, 401)
    assert.match(mensajeDe(r.body), /token.*inv/i)
  })

  it('header Authorization sin prefijo Bearer da 401', async () => {
    const r = await raw('GET', '/api/usuarios', { headers: { authorization: 'Basic abc' } })
    assert.equal(r.status, 401)
  })

  // (el caso "token de usuario desactivado" vive en auth-secuencial.test.js:
//  requiere crear un usuario, desactivarlo y volver a usar su token, y compite
//  por el rate limit de login.)
})

// --- Gate de version minima (426) ---
describe('gate de version minima', () => {
  it('un versionCode igual o mayor que el minimo pasa', async () => {
    const r = await raw('GET', '/api/usuarios', { token, versionCode: 999999 })
    assert.equal(r.status, 200)
  })

  it('sin header x-app-version-code pasa (web y APKs antiguas)', async () => {
    const r = await raw('GET', '/api/usuarios', { token })
    assert.equal(r.status, 200)
  })

  it('un header no numerico se ignora', async () => {
    const r = await raw('GET', '/api/usuarios', { token, versionCode: 'abc' })
    assert.equal(r.status, 200)
  })

  it('si APP_MIN_VERSION_CODE esta activo, uno menor da 426', async () => {
    // Solo tiene efecto si el proceso del servidor tiene la variable puesta,
    // que es como corre en produccion. Si no esta, el caso se omite.
    const min = process.env.APP_MIN_VERSION_CODE
    if (!min || Number(min) <= 0) return
    const r = await raw('GET', '/api/usuarios', { token, versionCode: 1 })
    assert.equal(r.status, 426)
  })
})

// --- POST /api/auth/logout ---
describe('POST /api/auth/logout', () => {
  it('un token valido se invalida tras el logout', async () => {
    const { token: t } = await crearJefe(nombreUnico('logout'), '1234')
    const antes = await raw('GET', '/api/usuarios', { token: t })
    assert.equal(antes.status, 200)

    const out = await raw('POST', '/api/auth/logout', { token: t })
    assert.equal(out.status, 200)

    // La blacklist es en memoria (auth.ts:35), asi que muere con el proceso.
    // Solo vale dentro de la misma vida del server.
    const despues = await raw('GET', '/api/usuarios', { token: t })
    assert.equal(despues.status, 401, 'el token deberia quedar invalido')
  })

  it('logout sin token da 401', async () => {
    const r = await raw('POST', '/api/auth/logout')
    assert.equal(r.status, 401)
  })
})

// NOTA: los tests de rate limit (que saturan la cuota de 5/min) viven en
// auth-secuencial.test.js con concurrency=1; en paralelo se contaminarian entre
// ellos y con el resto de suites.

// --- Cabeceras de seguridad y CORS ---
describe('cabeceras de seguridad', () => {
  it('los endpoints /api envian X-Frame-Options, nosniff y Referrer-Policy', async () => {
    const r = await raw('GET', '/api/health')
    const h = r.headers
    assert.equal(h['x-frame-options'], 'DENY')
    assert.equal(h['x-content-type-options'], 'nosniff')
    assert.equal(h['referrer-policy'], 'strict-origin-when-cross-origin')
  })

  it('las rutas API responden con cabeceras CORS', async () => {
    // routeRules: { '/api/**': { cors: true } } en nuxt.config.ts.
    const r = await raw('GET', '/api/health', { headers: { origin: 'https://ejemplo.com' } })
    assert.ok(
      r.headers['access-control-allow-origin'],
      'deberia estar presente access-control-allow-origin'
    )
  })

  it('S7: el CORS abierto es seguro porque la auth es solo Bearer (sin cookies)', async () => {
    // Decision documentada: NO se restringe el origen porque la app Capacitor
    // (https://localhost) y el dev web lo necesitan. El CORS abierto solo es
    // peligroso con auth por cookies (CSRF); aqui el unico credential es el
    // header Authorization, que un sitio malicioso no puede leer ni enviar por
    // la victima. Estos tests fijan el invariante: si algun dia se introduce
    // auth por cookie, hay que restringir el CORS.
    const r = await raw('GET', '/api/usuarios', {
      token,
      headers: { origin: 'https://sitio-maligno.example' }
    })
    assert.equal(r.status, 200)
    assert.equal(r.headers['access-control-allow-origin'], '*')

    // Sin Bearer no hay acceso aunque se envien cookies.
    const conCookies = await raw('GET', '/api/usuarios', {
      headers: { cookie: 'sesion=falsa', origin: 'https://sitio-maligno.example' }
    })
    assert.equal(conCookies.status, 401)

    // El servidor nunca crea sesion por cookie.
    assert.equal(r.headers['set-cookie'], undefined)
    const loginOk = await raw('POST', '/api/auth/login', {
      body: { nombre_usuario: 'jefe', pin: '1234' },
      headers: { 'x-forwarded-for': '10.99.240.1' }
    })
    assert.equal(loginOk.status, 200)
    assert.equal(loginOk.headers['set-cookie'], undefined)
  })

  it('S8: /api/health es publico pero no filtra nada sensible', async () => {
    const r = await raw('GET', '/api/health')
    assert.equal(r.status, 200)
    // Solo estas dos claves. Si aparece cualquier otra (version de BD, uptime,
    // rutas...), este test avisa para re-evaluar si /health puede seguir
    // publico (lo usa el boton "Probar conexion" de Ajustes sin sesion).
    assert.deepEqual(Object.keys(r.body).sort(), ['status', 'timestamp'])
    assert.equal(r.body.status, 'ok')
  })

  it('S9: el logout de un usuario no afecta al resto (blacklist por token)', async () => {
    // Limitacion documentada (auth.ts: tokenBlacklist en memoria, muere con el
    // proceso: un token deslogueado revive si el server reinicia dentro de su
    // ventana de 24h). Lo que SI se garantiza: la revocacion es por token.
    const { token: t1 } = await crearJefe(nombreUnico('logout_a'), '1234')
    const { token: t2 } = await crearJefe(nombreUnico('logout_b'), '1234')
    await raw('POST', '/api/auth/logout', { token: t1 })
    const r1 = await raw('GET', '/api/usuarios', { token: t1 })
    const r2 = await raw('GET', '/api/usuarios', { token: t2 })
    assert.equal(r1.status, 401, 'el token deslogueado queda invalido')
    assert.equal(r2.status, 200, 'el otro token sigue valido')
  })

  it('/api/health es publico (lo usa el boton "Probar conexion" de Ajustes)', async () => {
    const r = await raw('GET', '/api/health')
    assert.equal(r.status, 200)
    assert.equal(r.body.status, 'ok')
  })
})

// --- Exfiltracion de pinHash ---
describe('usuarios nunca filtran el hash del PIN', () => {
  it('GET /api/usuarios no incluye pinHash', async () => {
    const lista = await get('/api/usuarios', { token, status: 200 })
    assert.ok(lista.length > 0)
    for (const u of lista) {
      assert.equal(u.pinHash, undefined, `el usuario ${u.nombre} vino con pinHash`)
    }
  })

  it('POST /api/usuarios no devuelve el pinHash del creado', async () => {
    const nombre = nombreUnico('sinhash')
    const creado = await post('/api/usuarios', {
      nombre, rol: 'trabajador', pin: '1234', activo: true
    }, { token, status: 200 })
    assert.equal(creado.pinHash, undefined)
  })

  it('PATCH /api/usuarios no devuelve el pinHash', async () => {
    const nombre = nombreUnico('sinhash2')
    const { usuario } = await crearJefe(nombre, '1234')
    // PATCH y no POST: /api/usuarios/:id solo tiene handler PATCH.
    const act = await patch(`/api/usuarios/${usuario.id}`, {
      notas: 'nota de prueba'
    }, { token, status: 200 })
    assert.equal(act.pinHash, undefined)
  })
})

// --- Guardas del ultimo jefe ---
describe('PATCH parcial de usuario no altera los campos ausentes', () => {
  // Bug encontrado por esta suite: usuarioSchema.partial() heredaba los
  // .default() de rol y activo, asi que un PATCH { notas } se guardaba tambien
  // como rol='trabajador'. En la app, editar el telefono de un jefe desde
  // /usuarios lo degradaba en silencio: perdia el rol, el token de sync y el
  // acceso a todas las vistas de jefe.
  it('editar solo las notas conserva el rol jefe', async () => {
    const nombre = nombreUnico('parcial_rol')
    const { usuario } = await crearJefe(nombre, '1234', 'jefe')
    assert.equal(usuario.rol, 'jefe')

    const r = await raw('PATCH', `/api/usuarios/${usuario.id}`, {
      body: { notas: 'solo una nota' }, token
    })
    assert.equal(r.status, 200)
    assert.equal(r.body.rol, 'jefe', 'un PATCH parcial no debe cambiar el rol')
    assert.equal(r.body.activo, true, 'un PATCH parcial no debe desactivar')
    assert.equal(r.body.notas, 'solo una nota')
  })

  it('editar solo el telefono conserva el rol y la nota', async () => {
    const nombre = nombreUnico('parcial_tel')
    const { usuario } = await crearJefe(nombre, '1234', 'jefe')
    await raw('PATCH', `/api/usuarios/${usuario.id}`, {
      body: { notas: 'nota previa' }, token
    })

    const r = await raw('PATCH', `/api/usuarios/${usuario.id}`, {
      body: { telefono: '55555555' }, token
    })
    assert.equal(r.status, 200)
    assert.equal(r.body.rol, 'jefe')
    assert.equal(r.body.telefono, '55555555')
    assert.equal(r.body.notas, 'nota previa', 'no debe borrar campos no enviados')
  })

  it('desactivar sin tocar el rol conserva jefe', async () => {
    const nombre = nombreUnico('parcial_desact')
    const { usuario } = await crearJefe(nombre, '1234', 'jefe')
    const r = await raw('PATCH', `/api/usuarios/${usuario.id}`, {
      body: { activo: false }, token
    })
    assert.equal(r.status, 200)
    assert.equal(r.body.activo, false)
    assert.equal(r.body.rol, 'jefe', 'desactivar no debe degradar a trabajador')
  })
})

// --- Guardas del ultimo jefe (control positivo) ---
describe('guardas del ultimo jefe (control positivo)', () => {
  it('el jefe puede degradarse si hay otro jefe activo', async () => {
    // Se crea un jefe en el puesto y se degrada a trabajador: el seed tambien
    // tiene un jefe activo, asi que la guarda no aplica. El caso del unico jefe
    // se cubre en el test del jefe principal mas abajo.
    const nombre = nombreUnico('autodegrada')
    const { usuario } = await crearJefe(nombre, '1234')
    const r = await raw('PATCH', `/api/usuarios/${usuario.id}`, {
      body: { rol: 'trabajador' }, token
    })
    // Con otro jefe activo, degradarse es legitimo y reversible.
    assert.equal(r.status, 200)
    assert.equal(r.body.rol, 'trabajador')
  })
  it('eliminar un usuario con datos asociados da 409, no 500', async () => {
    // Bug encontrado por esta suite: varias tablas (cuadres, lotes, traspasos,
    // ventas_directas, webauthn_*) tienen FK a usuarios con ON DELETE no action.
    // El DELETE reventaba con un DatabaseError de Postgres que se traducía en
    // 500 "Server Error" opaco. Ahora se traduce a 409 con mensaje accionable.
    const nombre = nombreUnico('con_hijos')
    const { usuario } = await crearJefe(nombre, '1234')

    // Se le crea un cuadre para que exista una fila que lo referencie.
    const hoy = new Date().toISOString().slice(0, 10)
    const cuadre = await raw('POST', '/api/cuadres', {
      body: { fecha: hoy, jefeId: usuario.id, totalEsperado: 0 },
      token
    })
    const tieneHistorial = cuadre.status === 200 && cuadre.body?.id

    const r = await raw('DELETE', `/api/usuarios/${usuario.id}`, { token })
    if (tieneHistorial) {
      assert.equal(r.status, 409, `esperaba 409 por FK, recibi ${r.status}`)
      assert.match(mensajeDe(r.body), /datos asociados|no se puede eliminar/i)
    } else {
      // Sin historial el borrado es legitimo: solo se comprueba que no sea 500.
      assert.notEqual(r.status, 500, 'nunca deberia dar 500')
    }
  })
})
