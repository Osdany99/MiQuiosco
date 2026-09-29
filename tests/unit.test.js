import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { usuarioSchema } from '../shared/schemas/usuario.js'
import { cuadreItemSchema } from '../shared/schemas/cuadreItem.js'
import { createTransferenciaSchema } from '../shared/schemas/createTransferencia.js'
import { createAjusteSchema } from '../shared/schemas/createAjuste.js'
import { updateAjusteSchema } from '../shared/schemas/updateAjuste.js'
import { mergeFields } from '../app/utils/syncMerge.js'
import { fmtPrecio, calcularSalario, normalizarNumero, calcularSubtotalLinea } from '../app/utils/index.js'
import { sumarPorProducto, calcularExcesoTope } from '../shared/fiadoTope.js'
import { consumoPorProductoEnCuadreLocal, validarTopeGeneralLocal } from '../app/utils/topeGeneral.js'
import {
  separarSentencias,
  tablaExiste,
  crearTablasFaltantes,
  añadirColumnasFaltantes,
  crearIndicesFaltantes,
  ejecutarTransaccionSql,
  crearColaTransacciones
} from '../app/server-offline/db/esquema.js'

// --- usuarioSchema ---
describe('usuarioSchema', () => {
  it('acepta usuario válido sin pinHash', () => {
    const r = usuarioSchema.safeParse({ nombre: 'Ana', rol: 'trabajador', pin: '1234', activo: true })
    assert.equal(r.success, true)
    assert.equal(r.data.pinHash, undefined)
  })
  it('rechaza pinHash inyectado (mass assignment)', () => {
    const r = usuarioSchema.safeParse({ nombre: 'Ana', rol: 'jefe', pinHash: 'hash-malicioso', activo: true })
    // pinHash no está en el schema cliente → se stripea por Zod (no aparece en data)
    assert.equal(r.success, true)
    assert.equal(r.data.pinHash, undefined)
  })
  it('rechaza PIN corto', () => {
    const r = usuarioSchema.safeParse({ nombre: 'Ana', pin: '12' })
    assert.equal(r.success, false)
  })
})

// --- cuadreItemSchema ---
describe('cuadreItemSchema tipoLinea', () => {
  const uuidA = '550e8400-e29b-41d4-a716-446655440001'
  const uuidB = '550e8400-e29b-41d4-a716-446655440002'
  for (const tipo of ['normal', 'descuento', 'regalo', 'deuda', 'descuento_familiar']) {
    it(`acepta tipoLinea=${tipo}`, () => {
      const r = cuadreItemSchema.safeParse({ cuadreId: uuidA, productoId: uuidB, tipoLinea: tipo })
      assert.equal(r.success, true)
    })
  }
  it('rechaza tipoLinea inválido', () => {
    const r = cuadreItemSchema.safeParse({ cuadreId: uuidA, productoId: uuidB, tipoLinea: 'invalido' })
    assert.equal(r.success, false)
  })
})

// --- mergeFields (sync conflictos) ---
describe('mergeFields', () => {
  it('server null + client valor → difiereDelServidor true y aporta dato', () => {
    const server = { id: '1', telefono: null, actualizadoEn: '2026-01-01T00:00:00.000Z' }
    const client = { id: '1', telefono: '555', actualizadoEn: '2026-01-01T00:00:00.000Z' }
    const { merged, difiereDelServidor } = mergeFields(server, client)
    assert.equal(merged.telefono, '555')
    assert.equal(difiereDelServidor, true)
  })
  it('valores iguales → no difiere', () => {
    const server = { id: '1', nombre: 'A', actualizadoEn: '2026-01-01T00:00:00.000Z' }
    const client = { id: '1', nombre: 'A', actualizadoEn: '2026-01-01T00:00:00.000Z' }
    const { merged, difiereDelServidor } = mergeFields(server, client)
    assert.equal(merged.nombre, 'A')
    assert.equal(difiereDelServidor, false)
  })
  it('conflicto real (ambos no-null, difieren) → gana servidor (serverTs >= clientTs)', () => {
    const server = { id: '1', nombre: 'Server', actualizadoEn: '2026-01-02T00:00:00.000Z' }
    const client = { id: '1', nombre: 'Client', actualizadoEn: '2026-01-01T00:00:00.000Z' }
    const { merged } = mergeFields(server, client)
    assert.equal(merged.nombre, 'Server')
  })
})

// --- utils ---
describe('fmtPrecio y calcularSalario', () => {
  it('fmtPrecio formatea CUP', () => {
    const s = fmtPrecio(1234)
    assert.match(s, /1.*234/)
  })
  it('calcularSalario: base + 1% de lo vendido (15000 → 750)', () => {
    assert.equal(calcularSalario(600, 15000), 750)
  })
  it('calcularSalario: 8000 → 680', () => {
    assert.equal(calcularSalario(600, 8000), 680)
  })
  it('calcularSalario: 25000 → 850', () => {
    assert.equal(calcularSalario(600, 25000), 850)
  })
})

// --- normalizarNumero y calcularSubtotalLinea (blindaje NaN del cuadre) ---
describe('normalizarNumero', () => {
  it('cadena vacia normaliza a 0 (borrar el campo no genera NaN)', () => {
    assert.equal(normalizarNumero(''), 0)
  })
  it('null/undefined/NaN → 0', () => {
    assert.equal(normalizarNumero(null), 0)
    assert.equal(normalizarNumero(undefined), 0)
    assert.equal(normalizarNumero(NaN), 0)
  })
  it('números y strings numéricos pasan intactos', () => {
    assert.equal(normalizarNumero(10), 10)
    assert.equal(normalizarNumero('10'), 10)
    assert.equal(normalizarNumero(0), 0)
  })
})

describe('calcularSubtotalLinea', () => {
  it('caso normal: 100 x 3 = 300', () => {
    assert.equal(calcularSubtotalLinea(100, 3), 300)
  })
  it('cantidad NaN → subtotal 0 (no contamina el total)', () => {
    assert.equal(calcularSubtotalLinea(100, NaN), 0)
  })
  it('precio vacio normaliza a subtotal 0', () => {
    assert.equal(calcularSubtotalLinea('', 3), 0)
  })
  it('redondea a centavos', () => {
    assert.equal(calcularSubtotalLinea(10.333, 3), 31)
  })
})

// --- tope de fiado (compartido cliente/servidor) ---
describe('sumarPorProducto', () => {
  it('suma cantidades por productoId', () => {
    const map = sumarPorProducto([
      { productoId: 'p1', cantidad: 2 },
      { productoId: 'p2', cantidad: 1 },
      { productoId: 'p1', cantidad: 3 }
    ])
    assert.equal(map.get('p1'), 5)
    assert.equal(map.get('p2'), 1)
  })
  it('ignora cantidades no numéricas', () => {
    const map = sumarPorProducto([
      { productoId: 'p1', cantidad: null },
      { productoId: 'p1', cantidad: undefined },
      { productoId: 'p1', cantidad: NaN }
    ])
    assert.equal(map.get('p1'), 0)
  })
})

describe('calcularExcesoTope', () => {
  const vendidos = new Map([['p1', 4], ['p2', 10]])

  it('null cuando fiado no supera lo vendido', () => {
    const fiados = new Map([['p1', 2]])
    const exceso = calcularExcesoTope(vendidos, fiados, [{ productoId: 'p1', cantidad: 2 }])
    assert.equal(exceso, null)
  })

  it('detecta exceso y devuelve disponible correcto', () => {
    const fiados = new Map([['p1', 3]])
    const exceso = calcularExcesoTope(vendidos, fiados, [{ productoId: 'p1', cantidad: 2 }])
    assert.ok(exceso)
    assert.equal(exceso.productoId, 'p1')
    assert.equal(exceso.disponible, 1)
  })

  it('sin fiados previos, el limite es lo vendido', () => {
    const fiados = new Map()
    const exceso = calcularExcesoTope(vendidos, fiados, [{ productoId: 'p1', cantidad: 5 }])
    assert.ok(exceso)
    assert.equal(exceso.disponible, 4)
  })

  it('producto sin ventas no admite fiado', () => {
    const fiados = new Map()
    const exceso = calcularExcesoTope(vendidos, fiados, [{ productoId: 'p3', cantidad: 1 }])
    assert.ok(exceso)
    assert.equal(exceso.disponible, 0)
  })

  it('lineas sin productoId no cuentan', () => {
    const fiados = new Map()
    const exceso = calcularExcesoTope(vendidos, fiados, [
      { productoId: '', cantidad: 1 },
      { productoId: null, cantidad: 1 }
    ])
    assert.equal(exceso, null)
  })

  it('cantidad 0 en linea nueva no genera exceso', () => {
    const fiados = new Map([['p1', 4]])
    const exceso = calcularExcesoTope(vendidos, fiados, [{ productoId: 'p1', cantidad: 0 }])
    assert.equal(exceso, null)
  })
})

// --- consumo conjunto por producto (fiado + transferencia + ajustes) ---
function nuevoRepo(filas) {
  return { readAll: async () => [...filas] }
}

describe('consumoPorProductoEnCuadreLocal', () => {
  const cuadreId = 'c1'
  const repos = {
    cuentasRepo: nuevoRepo([
      { id: 'f1', cuadreOrigenId: cuadreId },
      { id: 'f2', cuadreOrigenId: 'otro-cuadre' }
    ]),
    cuentasItemsRepo: nuevoRepo([
      { cuentaFiadoId: 'f1', productoId: 'p1', cantidad: 2 }
    ]),
    transferenciasRepo: nuevoRepo([
      { id: 't1', cuadreId },
      { id: 't2', cuadreId: 'otro-cuadre' }
    ]),
    transferenciaItemsRepo: nuevoRepo([
      { transferenciaId: 't1', productoId: 'p1', cantidad: 3 },
      { transferenciaId: 't2', productoId: 'p2', cantidad: 9 }
    ]),
    ajustesRepo: nuevoRepo([
      { id: 'a1', cuadreId, productoId: 'p1', cantidad: 1 }
    ])
  }

  it('suma fiado + transferencia + ajustes del cuadre', async () => {
    const consumo = await consumoPorProductoEnCuadreLocal({ cuadreId, repos })
    assert.equal(consumo.get('p1'), 6) // 2 fiado + 3 transferencia + 1 ajuste
    assert.equal(consumo.get('p2'), undefined) // transferencia de otro cuadre
  })

  it('excluye cuentas, transferencias y ajustes indicados', async () => {
    const consumo = await consumoPorProductoEnCuadreLocal({
      cuadreId,
      repos,
      excluir: { cuentaIds: ['f1'], transferenciaIds: ['t1'], ajusteIds: ['a1'] }
    })
    assert.equal(consumo.get('p1'), undefined)
  })
})

describe('validarTopeGeneralLocal', () => {
  const cuadreId = 'c1'
  const repos = {
    cuadreItemsRepo: nuevoRepo([{ productoId: 'p1', cantidad: 10 }]),
    cuentasRepo: nuevoRepo([{ id: 'f1', cuadreOrigenId: cuadreId }]),
    cuentasItemsRepo: nuevoRepo([{ cuentaFiadoId: 'f1', productoId: 'p1', cantidad: 4 }]),
    transferenciasRepo: nuevoRepo([]),
    transferenciaItemsRepo: nuevoRepo([]),
    ajustesRepo: nuevoRepo([])
  }

  it('admite cuando queda tope disponible', async () => {
    const msg = await validarTopeGeneralLocal({
      cuadreId, repos,
      items: [{ productoId: 'p1', cantidad: 5 }],
      concepto: 'transferencia'
    })
    assert.equal(msg, null)
  })

  it('rechaza cuando se supera el tope conjunto', async () => {
    const msg = await validarTopeGeneralLocal({
      cuadreId, repos,
      items: [{ productoId: 'p1', cantidad: 7 }],
      concepto: 'transferencia'
    })
    assert.match(msg, /Tope excedido/)
    assert.match(msg, /quedan 6 unidades/)
  })
})

// --- schemas de transferencias y ajustes ---
describe('createTransferenciaSchema', () => {
  const uuid = '550e8400-e29b-41d4-a716-446655440001'
  it('acepta transferencia válida', () => {
    const r = createTransferenciaSchema.safeParse({
      clienteId: uuid,
      cuadreId: uuid,
      items: [{ productoId: uuid, cantidad: 2, precioVentaUsado: 50 }]
    })
    assert.equal(r.success, true)
  })
  it('rechaza sin items', () => {
    const r = createTransferenciaSchema.safeParse({ clienteId: uuid, cuadreId: uuid, items: [] })
    assert.equal(r.success, false)
  })
  it('rechaza cantidad negativa', () => {
    const r = createTransferenciaSchema.safeParse({
      clienteId: uuid,
      cuadreId: uuid,
      items: [{ productoId: uuid, cantidad: -1, precioVentaUsado: 50 }]
    })
    assert.equal(r.success, false)
  })
})

describe('createAjusteSchema', () => {
  const uuid = '550e8400-e29b-41d4-a716-446655440001'
  it('acepta ajuste de regalo sin cliente', () => {
    const r = createAjusteSchema.safeParse({
      cuadreId: uuid,
      productoId: uuid,
      tipo: 'regalo',
      cantidad: 1,
      monto: 50
    })
    assert.equal(r.success, true)
  })
  it('acepta ajuste de descuento con cliente', () => {
    const r = createAjusteSchema.safeParse({
      cuadreId: uuid,
      clienteId: uuid,
      productoId: uuid,
      tipo: 'descuento',
      cantidad: 1,
      monto: 20
    })
    assert.equal(r.success, true)
  })
  it('rechaza tipo inválido', () => {
    const r = createAjusteSchema.safeParse({
      cuadreId: uuid,
      productoId: uuid,
      tipo: 'regalado',
      cantidad: 1,
      monto: 50
    })
    assert.equal(r.success, false)
  })
})

describe('updateAjusteSchema', () => {
  it('permite editar solo el tipo', () => {
    const r = updateAjusteSchema.safeParse({ tipo: 'descuento' })
    assert.equal(r.success, true)
  })
  it('rechaza cambio de producto con uuid inválido', () => {
    const r = updateAjusteSchema.safeParse({ productoId: 'no-uuid' })
    assert.equal(r.success, false)
  })
})

// --- Journal SQLite + reconciliación de esquema (Bug A) ---
// Replica la secuencia de initializeSchema (solo instalación fresca y
// reconciliación de instalaciones existentes) contra un SQLite en memoria,
// con un adaptador del contrato de @capacitor-community/sqlite (run/query).

function memoDb() {
  const raw = new DatabaseSync(':memory:')
  return {
    async run(sql, params = []) {
      raw.prepare(sql).run(...params)
    },
    async query(sql, params = []) {
      return { values: raw.prepare(sql).all(...params) }
    },
    async execute(sql) {
      raw.exec(sql)
    },
    all(sql, params = []) {
      return raw.prepare(sql).all(...params)
    }
  }
}

function leerBaselineSqlite() {
  const dir = join(import.meta.dirname, '..', 'drizzle', 'sqlite')
  const archivos = readdirSync(dir).filter(f => f.endsWith('.sql')).sort()
  assert.ok(archivos.length > 0, 'debe existir el journal sqlite')
  return archivos.map(f => ({
    nombre: f,
    sql: readFileSync(join(dir, f), 'utf8')
  }))
}

describe('journal sqlite (instalación fresca)', () => {
  const journal = leerBaselineSqlite()
  const baseline = journal.map(j => j.sql).join('\n')

  it('aplica el baseline completo de corrido contra BD vacía', async () => {
    const conn = memoDb()
    await conn.run('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, aplicada_en INTEGER NOT NULL)', [])
    await conn.execute(baseline.replace(/--> statement-breakpoint/g, ''))
    await conn.run('INSERT OR REPLACE INTO _migrations (name, aplicada_en) VALUES (?, ?)', [journal[0].nombre, Date.now()])

    assert.equal(await tablaExiste(conn, 'usuarios'), true)
    assert.equal(await tablaExiste(conn, 'productos'), true)
    assert.equal(await tablaExiste(conn, 'cuadres'), true)
    assert.equal(await tablaExiste(conn, 'cuentas_fiado'), true)

    const colsUsuarios = await conn.query('PRAGMA table_info(usuarios)', [])
    const nombresUsuario = colsUsuarios.values.map(c => c.name)
    for (const esperada of ['id', 'puesto_id', 'nombre', 'pin_hash', 'rol', 'activo', 'telefono', 'notas']) {
      assert.ok(nombresUsuario.includes(esperada), `usuarios debe tener columna ${esperada}`)
    }
    const colsCuadres = await conn.query('PRAGMA table_info(cuadres)', [])
    const nombresCuadres = colsCuadres.values.map(c => c.name)
    for (const esperada of ['monto_regalo', 'monto_descuento']) {
      assert.ok(nombresCuadres.includes(esperada), `cuadres debe tener columna ${esperada}`)
    }
  })

  it('las sentencias separadas por statement-breakpoint ejecutan individualmente', async () => {
    const conn = memoDb()
    const sentencias = separarSentencias(baseline)
    assert.ok(sentencias.length >= 13, `se esperan al menos 13 sentencias, hay ${sentencias.length}`)
    for (const s of sentencias) {
      if (!/^CREATE\s+TABLE\s+/.test(s) && !/^CREATE\s+(UNIQUE\s+)?INDEX\s+/.test(s)) continue
      await conn.run(s, [])
    }
    assert.equal(await tablaExiste(conn, 'usuarios'), true)
    assert.equal(await tablaExiste(conn, 'transferencias'), true)
    assert.equal(await tablaExiste(conn, 'ajustes'), true)
  })
})

describe('reconciliación de instalación existente (Bug A auto-reparación)', () => {
  const journal = leerBaselineSqlite()
  const baseline = journal.map(j => j.sql).join('\n')
  const columnDefs = { usuarios: [{ name: 'telefono', sqlType: 'text', notNull: false, default: undefined }] }

  it('repara instalación parcial (usuarios viejo sin telefono) sin perder datos', async () => {
    const conn = memoDb()
    // Simula la instalación rota del Bug A: _migrations y usuarios viejos
    // (sin telefono/notas, sin puesto_id) creados, ninguna tabla nueva.
    await conn.run('CREATE TABLE usuarios (id text PRIMARY KEY, nombre text, pin_hash text, rol text, activo integer)', [])
    await conn.run('INSERT INTO usuarios (id, nombre, pin_hash, rol, activo) VALUES (\'u1\', \'jefe\', \'hash\', \'jefe\', 1)', [])
    await conn.run('CREATE TABLE _migrations (name TEXT PRIMARY KEY, aplicada_en INTEGER NOT NULL)', [])
    await conn.run('INSERT INTO _migrations (name, aplicada_en) VALUES (?, ?)', ['0000_exotic_mentallo.sql', 1])

    await crearTablasFaltantes(conn, baseline)
    await añadirColumnasFaltantes(conn, columnDefs)

    const cols = await conn.query('PRAGMA table_info(usuarios)', [])
    assert.ok(cols.values.map(c => c.name).includes('telefono'), 'telefono añadida')
    const fila = conn.all('SELECT nombre, rol, activo FROM usuarios LIMIT 1')
    assert.equal(fila[0].nombre, 'jefe')
    assert.equal(fila[0].rol, 'jefe')
    assert.equal(await tablaExiste(conn, 'cuadres'), true, 'tablas faltantes creadas')
  })

  it('reconciliación es idempotente (no rompe instalación sana)', async () => {
    const conn = memoDb()
    await conn.execute(baseline.replace(/--> statement-breakpoint/g, ''))
    await conn.run('INSERT INTO usuarios (id, puesto_id, nombre, pin_hash, rol, activo, creado_en, actualizado_en) VALUES (\'u1\', \'p1\', \'jefe\', \'hash\', \'jefe\', 1, 1, 1)', [])

    await crearTablasFaltantes(conn, baseline)
    await añadirColumnasFaltantes(conn, columnDefs)
    await crearIndicesFaltantes(conn, baseline)

    const fila = conn.all('SELECT nombre FROM usuarios LIMIT 1')
    assert.equal(fila[0].nombre, 'jefe')
    assert.equal(await tablaExiste(conn, 'productos'), true)
  })
})

// --- Transacciones SQLite con SQL crudo + serialización ---
// Las transacciones usan BEGIN IMMEDIATE/COMMIT/ROLLBACK como sentencias SQL
// (independientes de la versión del plugin). Con conexiones falsas se verifica
// el orden, el rollback ante fallos, la serialización y la auto-reparación
// cuando la conexión trae una transacción abierta huérfana.

function connFalsaSql(eventos, { fallaBeginVeces = 0 } = {}) {
  let intentosBegin = 0
  return {
    async run(sql, ...rest) {
      const transaction = rest[1] ?? true
      eventos.push({ sql, transaction })
      if (sql === 'BEGIN IMMEDIATE') {
        intentosBegin += 1
        if (intentosBegin <= fallaBeginVeces) {
          throw new Error('Run: Failed in beginTransaction Already in transaction')
        }
      }
    }
  }
}

function soloSql(eventos) {
  return eventos.map(e => (typeof e === 'string' ? e : e.sql))
}

describe('ejecutarTransaccionSql', () => {
  it('BEGIN IMMEDIATE → fn → COMMIT en orden y devuelve el resultado', async () => {
    const eventos = []
    const r = await ejecutarTransaccionSql(connFalsaSql(eventos), async () => {
      eventos.push('fn')
      return 42
    }, {})
    assert.equal(r, 42)
    assert.deepEqual(soloSql(eventos), ['BEGIN IMMEDIATE', 'fn', 'COMMIT'])
  })

  it('el control viaja con transaction:false (sin implícitas del plugin)', async () => {
    const eventos = []
    await ejecutarTransaccionSql(connFalsaSql(eventos), async () => {}, {})
    for (const e of eventos) {
      assert.equal(e.transaction, false, `${e.sql} debe usar transaction:false`)
    }
  })

  it('ante fallo de fn hace ROLLBACK y propaga el error', async () => {
    const eventos = []
    await assert.rejects(
      ejecutarTransaccionSql(connFalsaSql(eventos), async () => {
        eventos.push('fn')
        throw new Error('falla fn')
      }, {}),
      /falla fn/
    )
    assert.deepEqual(soloSql(eventos), ['BEGIN IMMEDIATE', 'fn', 'ROLLBACK'])
  })

  it('auto-repara transacción huérfana: ROLLBACK + reintento del BEGIN', async () => {
    const eventos = []
    const r = await ejecutarTransaccionSql(connFalsaSql(eventos, { fallaBeginVeces: 1 }), async () => {
      eventos.push('fn')
      return 'ok'
    }, {})
    assert.equal(r, 'ok')
    assert.deepEqual(soloSql(eventos), ['BEGIN IMMEDIATE', 'ROLLBACK', 'BEGIN IMMEDIATE', 'fn', 'COMMIT'])
  })

  it('si el BEGIN falla por otro motivo, propaga sin reintentar', async () => {
    const eventos = []
    const conn = {
      async run(sql) {
        eventos.push({ sql })
        if (sql === 'BEGIN IMMEDIATE') throw new Error('database is locked')
      }
    }
    await assert.rejects(ejecutarTransaccionSql(conn, async () => {}, {}), /database is locked/)
    assert.deepEqual(soloSql(eventos), ['BEGIN IMMEDIATE'])
  })
})

describe('crearColaTransacciones (serialización)', () => {
  it('dos transacciones concurrentes no se solapan', async () => {
    const eventos = []
    const cola = crearColaTransacciones()
    const lenta = cola.ejecutar(connFalsaSql(eventos), async () => {
      eventos.push('fn1-ini')
      await new Promise(r => setTimeout(r, 20))
      eventos.push('fn1-fin')
    }, {})
    const rapida = cola.ejecutar(connFalsaSql(eventos), async () => {
      eventos.push('fn2')
    }, {})
    await Promise.all([lenta, rapida])
    // La segunda no empieza (ni BEGIN ni fn) hasta el COMMIT de la primera.
    assert.deepEqual(soloSql(eventos), ['BEGIN IMMEDIATE', 'fn1-ini', 'fn1-fin', 'COMMIT', 'BEGIN IMMEDIATE', 'fn2', 'COMMIT'])
  })

  it('una transacción fallida no bloquea la siguiente', async () => {
    const eventos = []
    const cola = crearColaTransacciones()
    await assert.rejects(cola.ejecutar(connFalsaSql(eventos), async () => {
      throw new Error('x')
    }, {}), /x/)
    const r = await cola.ejecutar(connFalsaSql(eventos), async () => 'ok', {})
    assert.equal(r, 'ok')
    assert.deepEqual(soloSql(eventos), ['BEGIN IMMEDIATE', 'ROLLBACK', 'BEGIN IMMEDIATE', 'COMMIT'])
  })
})
