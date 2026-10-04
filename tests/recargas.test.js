import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import {
  parseEtecsaSms,
  normalizarTelefono,
  normalizarMonto
} from '../app/utils/parseEtecsaSms.js'
import { eliminarColumnasObsoletas } from '../app/server-offline/db/esquema.js'

const aqui = dirname(fileURLToPath(import.meta.url))
const corpus = JSON.parse(readFileSync(join(aqui, 'fixtures', 'sms-etecsa-corpus.json'), 'utf8'))

// --- normalizarTelefono ---
describe('normalizarTelefono', () => {
  it('prefija 53 a los 8 dígitos de Banco Metropolitano', () => {
    assert.equal(normalizarTelefono('52827521'), '5352827521')
    assert.equal(normalizarTelefono('58971694'), '5358971694')
  })
  it('deja intactos los 10 dígitos de Monedero', () => {
    assert.equal(normalizarTelefono('5354561527'), '5354561527')
  })
  it('limpia espacios y guiones', () => {
    assert.equal(normalizarTelefono(' 5282-7521 '), '5352827521')
  })
})

// --- normalizarMonto ---
describe('normalizarMonto', () => {
  it('el punto es decimal, no de miles', () => {
    assert.equal(normalizarMonto('3863.49'), 3863.49)
    assert.equal(normalizarMonto('324.0'), 324)
    assert.equal(normalizarMonto('225.00'), 225)
  })
  it('tolera el punto final pegado', () => {
    assert.equal(normalizarMonto('4088.49.'), 4088.49)
  })
  it('devuelve null ante basura', () => {
    assert.equal(normalizarMonto('CR'), null)
    assert.equal(normalizarMonto(null), null)
  })
})

// --- rechazos (no son recargas) ---
describe('parseEtecsaSms rechaza lo que no es recarga', () => {
  it('autenticación (28 en el buzón)', () => {
    const r = parseEtecsaSms({
      remitente: 'PAGOxMOVIL',
      cuerpo: 'Usted se ha autenticado en la plataforma de pagos moviles, en el Banco Metropolitano, puede comenzar a utilizar nuestros servicios de pagos a traves del movil'
    })
    assert.equal(r, null)
  })
  it('consulta de saldo', () => {
    const r = parseEtecsaSms({
      remitente: 'PAGOxMOVIL',
      cuerpo: 'Banco Metropolitano: La consulta de saldo fue completada. Saldo Contable: CR 20166.83 CUP Saldo Disponible: CR 20166.83 CUP'
    })
    assert.equal(r, null)
  })
  it('transferencia (T26…)', () => {
    const r = parseEtecsaSms({
      remitente: 'PAGOxMOVIL',
      cuerpo: 'Banco Metropolitano: La Transferencia fue completada. Fecha: 16/6/2026 Beneficiario: 9204XXXXXXXX0803 Ordenante: CUP Monto: 2400.00 CUP Nro. Transaccion: T261680000CVP'
    })
    assert.equal(r, null)
  })
  it('mensaje personal del mismo remitente numérico', () => {
    const r = parseEtecsaSms({
      remitente: '+5353138610',
      cuerpo: 'Yo t llame para saber d ti. Si habia podido coger la guagua.'
    })
    assert.equal(r, null)
  })
  it('SMS de error (fallida) no genera recarga', () => {
    const r = parseEtecsaSms({
      remitente: 'PAGOxMOVIL',
      cuerpo: 'Fallo la recarga del movil 5352827521 alcanzo el monto limite de recarga permitido en 30 dias (360 CUP), puede recargar posterior al dia 11-09-2026.'
    })
    assert.equal(r, null)
  })
  it('recarga entrante sin ID de transacción queda en el log', () => {
    const r = parseEtecsaSms({
      remitente: 'PAGOxMOVIL',
      cuerpo: 'Usted ha recibido una recarga de saldo movil por un monto de 360 CUP del numero 5358971694. Monto restante a recargar para el periodo: 0 CUP.'
    })
    assert.equal(r, null)
  })
})

// --- corpus completo: 13 recargas, 0 falsos negativos ---
describe('parseEtecsaSms contra el corpus real (191 SMS)', () => {
  const parseados = corpus
    .map(m => ({ sms: m, r: parseEtecsaSms({ remitente: m.address, cuerpo: m.body }) }))
    .filter(x => x.r)

  it('parsea exactamente 13 recargas', () => {
    assert.equal(parseados.length, 13)
  })
  it('sin IDs de transacción duplicados', () => {
    const ids = parseados.map(x => x.r.idTransaccion)
    assert.equal(new Set(ids).size, ids.length)
  })
  it('ganancia exactamente 10.00% en las 13', () => {
    for (const { r } of parseados) {
      const pct = Math.round((r.ganancia / r.montoNominal) * 10000) / 100
      assert.equal(pct, 10, JSON.stringify(r))
    }
  })
  it('11 de banco + 2 de monedero', () => {
    const porPlat = Object.groupBy
      ? Object.groupBy(parseados, x => x.r.plataforma)
      : parseados.reduce((a, x) => ((a[x.r.plataforma] ??= []).push(x), a), {})
    assert.equal((porPlat.banco ?? []).length, 11)
    assert.equal((porPlat.monedero ?? []).length, 2)
  })
  it('los teléfonos de banco (8 dígitos) se normalizan a 10', () => {
    for (const { r } of parseados.filter(x => x.r.plataforma === 'banco')) {
      assert.match(r.telefono, /^\d{10}$/)
    }
  })
  it('el plan de voz trae tipo y unidades', () => {
    const voz = parseados.filter(x => x.r.tipo === 'voz')
    assert.equal(voz.length, 1)
    assert.equal(voz[0].r.unidades, 40)
    assert.equal(voz[0].r.montoNominal, 250)
    assert.equal(voz[0].r.ganancia, 25)
  })
  it('la recarga de saldo trae nominal 360 y ganancia 36', () => {
    const saldos = parseados.filter(x => x.r.tipo === 'saldo')
    assert.equal(saldos.length, 12)
    for (const { r } of saldos) {
      assert.equal(r.montoNominal, 360)
      assert.equal(r.ganancia, 36)
    }
  })
})

// --- eliminarColumnasObsoletas (reparación de instalaciones viejas) ---
// Sin esto, `clientes_telefonos` conservaba `usuario_id NOT NULL` sin DEFAULT
// de una versión anterior y TODO insert de teléfono fallaba en el dispositivo.

const DEFS_TELEFONOS = {
  clientes_telefonos: [
    { name: 'id', sqlType: 'text', notNull: true },
    { name: 'puesto_id', sqlType: 'text', notNull: true },
    { name: 'cliente_id', sqlType: 'text', notNull: true },
    { name: 'telefono', sqlType: 'text', notNull: true },
    { name: 'activo', sqlType: 'integer', notNull: true, default: true },
    { name: 'sincronizado', sqlType: 'integer', notNull: true, default: false }
  ]
}

/**
 * Estado real de una instalación que ya corrió la versión vieja: `usuario_id`
 * sigue ahí (NOT NULL, sin DEFAULT) y `cliente_id` ya la había añadido la
 * reconciliación. Por eso el insert que hoy no manda `usuario_id` revienta.
 */
const SQL_VIEJO = `CREATE TABLE clientes_telefonos (
  id text PRIMARY KEY NOT NULL,
  puesto_id text NOT NULL,
  usuario_id text NOT NULL,
  telefono text NOT NULL,
  activo integer DEFAULT true NOT NULL,
  sincronizado integer DEFAULT false NOT NULL,
  cliente_id text NOT NULL
)`

function connDe(raw) {
  return {
    async run(sql, params = []) {
      raw.prepare(sql).run(...params)
    },
    async query(sql, params = []) {
      return { values: raw.prepare(sql).all(...params) }
    },
    async execute(sql) {
      raw.exec(sql)
    }
  }
}

function columnasDe(raw, tabla) {
  return raw.prepare(`PRAGMA table_info(${tabla})`).all().map(c => c.name)
}

describe('eliminarColumnasObsoletas', () => {
  it('quita la columna vieja y deja insertar sin ella', async () => {
    const raw = new DatabaseSync(':memory:')
    raw.exec(SQL_VIEJO)
    const conn = connDe(raw)

    assert.ok(await eliminarColumnasObsoletas(conn, 'clientes_telefonos', DEFS_TELEFONOS, ['usuario_id']))
    assert.deepEqual(columnasDe(raw, 'clientes_telefonos').includes('usuario_id'), false)

    // Este es exactamente el insert que fallaba en el teléfono.
    raw.prepare(
      'INSERT INTO clientes_telefonos (id, puesto_id, cliente_id, telefono) VALUES (?,?,?,?)'
    ).run('a', 'p', 'c', '5354561527')
    assert.equal(raw.prepare('SELECT count(*) AS n FROM clientes_telefonos').get().n, 1)
  })

  it('conserva las filas que ya tenía', async () => {
    const raw = new DatabaseSync(':memory:')
    raw.exec(SQL_VIEJO)
    raw.prepare('INSERT INTO clientes_telefonos (id, puesto_id, usuario_id, cliente_id, telefono) VALUES (?,?,?,?,?)')
      .run('a', 'p', 'u', 'c', '5354561527')

    await eliminarColumnasObsoletas(connDe(raw), 'clientes_telefonos', DEFS_TELEFONOS, ['usuario_id'])
    assert.equal(raw.prepare('SELECT telefono FROM clientes_telefonos').get().telefono, '5354561527')
  })

  it('es idempotente: si la columna ya no está, no hace nada', async () => {
    const raw = new DatabaseSync(':memory:')
    raw.exec('CREATE TABLE clientes_telefonos (id text PRIMARY KEY NOT NULL, cliente_id text NOT NULL)')
    assert.equal(
      await eliminarColumnasObsoletas(connDe(raw), 'clientes_telefonos', DEFS_TELEFONOS, ['usuario_id']),
      false
    )
  })

  it('no toca tablas inexistentes', async () => {
    const raw = new DatabaseSync(':memory:')
    assert.equal(
      await eliminarColumnasObsoletas(connDe(raw), 'clientes_telefonos', DEFS_TELEFONOS, ['usuario_id']),
      false
    )
  })

  it('reconstruye la tabla si DROP COLUMN no está soportado (SQLite antiguo)', async () => {
    const raw = new DatabaseSync(':memory:')
    raw.exec(SQL_VIEJO)
    raw.prepare('INSERT INTO clientes_telefonos (id, puesto_id, usuario_id, cliente_id, telefono) VALUES (?,?,?,?,?)')
      .run('a', 'p', 'u', 'c', '5354561527')

    // Se simula un SQLite sin DROP COLUMN (todo ALTER ... DROP ... revienta).
    const conn = {
      ...connDe(raw),
      async run(sql, params = []) {
        if (/DROP COLUMN/.test(sql)) throw new Error('near "DROP": syntax error')
        raw.prepare(sql).run(...params)
      }
    }

    assert.ok(await eliminarColumnasObsoletas(conn, 'clientes_telefonos', DEFS_TELEFONOS, ['usuario_id']))
    assert.deepEqual(columnasDe(raw, 'clientes_telefonos').includes('usuario_id'), false)
    assert.equal(raw.prepare('SELECT telefono FROM clientes_telefonos').get().telefono, '5354561527')
    raw.prepare('INSERT INTO clientes_telefonos (id, puesto_id, cliente_id, telefono) VALUES (?,?,?,?)')
      .run('b', 'p', 'c', '5354561528')
    assert.equal(raw.prepare('SELECT count(*) AS n FROM clientes_telefonos').get().n, 2)
  })
})
