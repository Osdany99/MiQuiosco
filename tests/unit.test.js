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
import { etiquetaFaseSync } from '../app/utils/syncFases.js'
import { fmtPrecio, calcularSalario, normalizarNumero, calcularSubtotalLinea } from '../app/utils/index.js'
import { sumarPorProducto, calcularExcesoTope } from '../shared/fiadoTope.js'
import { consumoPorProductoEnCuadreLocal, validarTopeGeneralLocal } from '../app/utils/topeGeneral.js'
import { aEpoch, aEpochOpcional, normalizarFechas } from '../shared/fechas.js'
import { deriveColumnTypes, coerceRow, deriveTimestampCols } from '../app/server-offline/utils/schemaTypes.js'
import { updateProductoMut } from '../shared/mutations/producto.js'
import {
  separarSentencias,
  tablaExiste,
  crearTablasFaltantes,
  añadirColumnasFaltantes,
  crearIndicesFaltantes,
  ejecutarTransaccionSql,
  crearColaTransacciones,
  aplicarBaseline
} from '../app/server-offline/db/esquema.js'

// --- etiquetaFaseSync (banner de sincronización) ---
describe('etiquetaFaseSync', () => {
  it('inactiva y desconocida devuelven vacío', () => {
    assert.equal(etiquetaFaseSync('inactiva'), '')
    assert.equal(etiquetaFaseSync('otra'), '')
  })
  it('subiendo muestra el total de pendientes', () => {
    assert.equal(etiquetaFaseSync('subiendo', { actual: 0, total: 40 }), 'Subiendo 40 cambios…')
    assert.equal(etiquetaFaseSync('subiendo', { actual: 0, total: 1 }), 'Subiendo 1 cambio…')
    assert.equal(etiquetaFaseSync('subiendo'), 'Subiendo cambios…')
  })
  it('aplicando muestra actual/total', () => {
    assert.equal(etiquetaFaseSync('aplicando', { actual: 3, total: 10 }), 'Aplicando 3/10…')
  })
  it('preparando y bajando tienen texto fijo', () => {
    assert.equal(etiquetaFaseSync('preparando'), 'Preparando cambios…')
    assert.equal(etiquetaFaseSync('bajando'), 'Bajando cambios…')
  })
})
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
  it('cliente mas nuevo gana (clientTs > serverTs)', () => {
    const server = { id: '1', nombre: 'Server', actualizadoEn: '2026-01-01T00:00:00.000Z' }
    const client = { id: '1', nombre: 'Client', actualizadoEn: '2026-01-03T00:00:00.000Z' }
    const { merged } = mergeFields(server, client)
    assert.equal(merged.nombre, 'Client')
  })
  it('empate exacto de timestamps → gana servidor', () => {
    const ts = '2026-01-01T00:00:00.000Z'
    const server = { id: '1', nombre: 'Server', actualizadoEn: ts }
    const client = { id: '1', nombre: 'Client', actualizadoEn: ts }
    const { merged } = mergeFields(server, client)
    assert.equal(merged.nombre, 'Server')
  })
  it('valor → null no marca difiereDelServidor (el null no pisa)', () => {
    const server = { id: '1', telefono: '555', actualizadoEn: '2026-01-01T00:00:00.000Z' }
    const client = { id: '1', telefono: null, actualizadoEn: '2026-01-02T00:00:00.000Z' }
    const { merged, difiereDelServidor } = mergeFields(server, client)
    assert.equal(merged.telefono, '555')
    assert.equal(difiereDelServidor, false)
  })
  it('id siempre del servidor y sincronizado siempre 1', () => {
    const server = { id: 's1', sincronizado: 0, actualizadoEn: '2026-01-01T00:00:00.000Z' }
    const client = { id: 'c1', sincronizado: 0, actualizadoEn: '2026-01-05T00:00:00.000Z' }
    const { merged } = mergeFields(server, client)
    assert.equal(merged.id, 's1')
    assert.equal(merged.sincronizado, 1)
  })
  it('actualizadoEn ausente cuenta como 0 (el otro lado gana)', () => {
    const server = { id: '1', nombre: 'Server' }
    const client = { id: '1', nombre: 'Client', actualizadoEn: '2026-01-01T00:00:00.000Z' }
    const { merged } = mergeFields(server, client)
    assert.equal(merged.nombre, 'Client')
  })
  it('clave solo en cliente con valor → se aporta y difiere', () => {
    const server = { id: '1', actualizadoEn: '2026-01-01T00:00:00.000Z' }
    const client = { id: '1', extra: 'x', actualizadoEn: '2026-01-01T00:00:00.000Z' }
    const { merged, difiereDelServidor } = mergeFields(server, client)
    assert.equal(merged.extra, 'x')
    assert.equal(difiereDelServidor, true)
  })
})

// --- utils ---
describe('fmtPrecio y calcularSalario', () => {
  it('fmtPrecio formatea CUP', () => {
    const s = fmtPrecio(1234)
    assert.match(s, /1.*234/)
  })
  // El bono es 1% solo de lo vendido por encima de 10000: los primeros
  // 10 000 del día no cuentan.
  it('calcularSalario: 20000 → base + 100 (el ejemplo del jefe)', () => {
    assert.equal(calcularSalario(600, 20000), 700)
  })
  it('calcularSalario: justo en el umbral (10000) → solo la base', () => {
    assert.equal(calcularSalario(600, 10000), 600)
  })
  it('calcularSalario: por debajo del umbral (8000) → solo la base', () => {
    assert.equal(calcularSalario(600, 8000), 600)
  })
  it('calcularSalario: 15000 → 50 de bono (750? no: 650)', () => {
    assert.equal(calcularSalario(600, 15000), 650)
  })
  it('calcularSalario: 25000 → 150 de bono', () => {
    assert.equal(calcularSalario(600, 25000), 750)
  })
  it('calcularSalario: un día en blanco no resta la base', () => {
    assert.equal(calcularSalario(600, 0), 600)
  })
  it('calcularSalario: base distinta (800) + excedente de 20000 → 900', () => {
    assert.equal(calcularSalario(800, 20000), 900)
  })
  it('calcularSalario: total indefinido no rompe el cálculo', () => {
    assert.equal(calcularSalario(600, undefined), 600)
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

// --- orden de productos por arrastre (productos.vue) ---
describe('mover (reordenamiento de productos)', () => {
  const mover = (ids, from, to) => {
    const arr = [...ids]
    const [m] = arr.splice(from, 1)
    arr.splice(to, 0, m)
    return arr.map((id, i) => ({ id, orden: i + 1 }))
  }

  it('soltar el 3ro de primero lo deja primero (el caso que fallaba)', () => {
    const r = mover(['p1', 'p2', 'p3'], 2, 0)
    assert.deepEqual(r, [
      { id: 'p3', orden: 1 },
      { id: 'p1', orden: 2 },
      { id: 'p2', orden: 3 }
    ])
  })

  it('soltar el 1ro al final lo deja último', () => {
    const r = mover(['p1', 'p2', 'p3'], 0, 2)
    assert.deepEqual(r, [
      { id: 'p2', orden: 1 },
      { id: 'p3', orden: 2 },
      { id: 'p1', orden: 3 }
    ])
  })

  it('mover una fila al medio con 4 elementos', () => {
    const r = mover(['p1', 'p2', 'p3', 'p4'], 3, 1)
    assert.deepEqual(r, [
      { id: 'p1', orden: 1 },
      { id: 'p4', orden: 2 },
      { id: 'p2', orden: 3 },
      { id: 'p3', orden: 4 }
    ])
  })

  it('el orden es siempre 1..n sin huecos ni repetidos', () => {
    const r = mover(['a', 'b', 'c', 'd', 'e'], 2, 4)
    assert.deepEqual(r.map(x => x.orden), [1, 2, 3, 4, 5])
    assert.equal(new Set(r.map(x => x.id)).size, 5)
  })
})

// --- líneas duplicadas del cuadre (mismo producto, distinto precio) ---
describe('líneas de cuadre con el mismo producto', () => {
  it('el total esperado suma ambas líneas (pan a 10 y a 12)', () => {
    const lineas = [
      { productoId: 'pan', precioVentaUsado: 10, cantidad: 2, subtotal: 20, esExtra: false },
      { productoId: 'pan', precioVentaUsado: 12, cantidad: 4, subtotal: 48, esExtra: true }
    ]
    const total = lineas.reduce((s, l) => s + l.subtotal, 0)
    assert.equal(total, 68)
  })

  it('el tope de fiado consume las unidades de ambas líneas', () => {
    const map = sumarPorProducto([
      { productoId: 'pan', cantidad: 2 },
      { productoId: 'pan', cantidad: 4 }
    ])
    assert.equal(map.get('pan'), 6)
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
  it('acepta transferencia válida (cliente + monto)', () => {
    const r = createTransferenciaSchema.safeParse({
      clienteId: uuid,
      cuadreId: uuid,
      monto: 400
    })
    assert.equal(r.success, true)
  })
  it('rechaza sin monto', () => {
    const r = createTransferenciaSchema.safeParse({ clienteId: uuid, cuadreId: uuid })
    assert.equal(r.success, false)
  })
  it('rechaza monto cero o negativo', () => {
    assert.equal(createTransferenciaSchema.safeParse({ clienteId: uuid, cuadreId: uuid, monto: 0 }).success, false)
    assert.equal(createTransferenciaSchema.safeParse({ clienteId: uuid, cuadreId: uuid, monto: -5 }).success, false)
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
  const baseline = journal.map(j => j.sql).join('\n--> statement-breakpoint\n')

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
    // Se ejecutan también DROP TABLE y RENAME: las migraciones que rebuildan
    // una tabla (cambiar NOT NULL) crean __new_<tabla>, copian, borran la
    // original y renombran. Sin el DROP, el CREATE INDEX posterior chocaría
    // contra el índice que ya existía en la tabla original.
    for (const s of sentencias) {
      if (!/^CREATE\s+TABLE\s+/.test(s)
        && !/^CREATE\s+(UNIQUE\s+)?INDEX\s+/.test(s)
        && !/^DROP\s+TABLE\s+/.test(s)
        && !/^ALTER\s+TABLE\s+\S+\s+RENAME\s+TO\s+/.test(s)) continue
      await conn.run(s, [])
    }
    assert.equal(await tablaExiste(conn, 'usuarios'), true)
    assert.equal(await tablaExiste(conn, 'transferencias'), true)
    assert.equal(await tablaExiste(conn, 'ajustes'), true)
  })

  it('aplicarBaseline sentencia por sentencia crea el esquema y es idempotente', async () => {
    const conn = memoDb()
    await conn.run('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, aplicada_en INTEGER NOT NULL)', [])
    await aplicarBaseline(conn, baseline)

    assert.equal(await tablaExiste(conn, 'usuarios'), true)
    assert.equal(await tablaExiste(conn, 'movimientos_inventario'), true)
    const colsMov = await conn.query('PRAGMA table_info(movimientos_inventario)', [])
    const nombresMov = colsMov.values.map(c => c.name)
    assert.ok(nombresMov.includes('actualizado_en'), 'movimientos debe tener actualizado_en (0002)')
    assert.ok(nombresMov.includes('venta_directa_id'), 'movimientos debe tener venta_directa_id (0005)')

    // Reintento tras éxito (o tras fallo parcial con CREATEs ya aplicados):
    // converge sin romper.
    await aplicarBaseline(conn, baseline)
    assert.equal(await tablaExiste(conn, 'cuadres'), true)
  })

  it('aplicarBaseline señala la sentencia que falla', async () => {
    const conn = memoDb()
    await assert.rejects(
      aplicarBaseline(conn, 'CREATE TABLE t1 (id text);--> statement-breakpoint\nESTO NO ES SQL VALIDO'),
      /ESTO NO ES SQL VALIDO/
    )
  })
})

describe('reconciliación de instalación existente (Bug A auto-reparación)', () => {
  const journal = leerBaselineSqlite()
  const baseline = journal.map(j => j.sql).join('\n--> statement-breakpoint\n')
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

// --- Fechas: ISO del servidor ↔ epoch ms de SQLite ---
// El bug de origen: el pull entrega las marcas de tiempo como ISO-8601 y la BD
// local las guarda en columnas integer. Con Number(iso) === NaN, el valor llega
// a SQLite como NULL y el cambio de precio revienta con el error 1299.
describe('aEpoch', () => {
  it('deja intacto un epoch ms', () => {
    assert.equal(aEpoch(1770000000000), 1770000000000)
  })
  it('convierte un ISO-8601 a epoch ms', () => {
    assert.equal(aEpoch('2026-07-11T19:13:55.004Z'), Date.parse('2026-07-11T19:13:55.004Z'))
  })
  it('sin fecha interpretable devuelve 0, nunca NaN', () => {
    assert.equal(aEpoch(null), 0)
    assert.equal(aEpoch(undefined), 0)
    assert.equal(aEpoch('no-es-fecha'), 0)
    assert.equal(aEpoch(Number.NaN), 0)
    assert.equal(aEpoch(Number.POSITIVE_INFINITY), 0)
  })
  it('aEpochOpcional distingue "no hay fecha" (null) del origen epoch (0)', () => {
    assert.equal(aEpochOpcional(null), null)
    assert.equal(aEpochOpcional('no-es-fecha'), null)
    assert.equal(aEpochOpcional(0), 0)
    assert.equal(aEpochOpcional('2026-07-11T19:13:55.004Z'), Date.parse('2026-07-11T19:13:55.004Z'))
  })
})

describe('normalizarFechas', () => {
  it('convierte solo las claves indicadas y respeta los null', () => {
    const fila = { id: 'x', creadoEn: '2026-07-11T19:13:55.004Z', vigenteHasta: null, nombre: '2026-07-11T19:13:55.004Z' }
    const out = normalizarFechas(fila, ['creadoEn', 'vigenteHasta', 'vigenteDesde'])
    assert.equal(out.creadoEn, Date.parse('2026-07-11T19:13:55.004Z'))
    assert.equal(out.vigenteHasta, null, 'vigenteHasta null significa "sigue vigente"')
    assert.equal(out.nombre, '2026-07-11T19:13:55.004Z', 'una columna que no es fecha no se toca')
    assert.equal(fila.creadoEn, '2026-07-11T19:13:55.004Z', 'no muta la entrada')
  })
  it('una fecha ilegible se deja como estaba en vez de inventar un 0', () => {
    const out = normalizarFechas({ creadoEn: 'basura' }, ['creadoEn'])
    assert.equal(out.creadoEn, 'basura')
  })
})

describe('coerceRow con columnas timestamp', () => {
  // Schema mínimo con la forma de las columnas Drizzle reales.
  const NAME = Symbol.for('drizzle:Name')
  const COLS = Symbol.for('drizzle:Columns')
  const schema = {
    historial_precios: {
      [NAME]: 'historial_precios',
      [COLS]: {
        id: { dataType: 'string', notNull: true },
        productoId: { dataType: 'string', notNull: true },
        vigenteDesde: { dataType: 'date', mode: 'timestamp_ms', notNull: true },
        vigenteHasta: { dataType: 'date', mode: 'timestamp_ms', notNull: false }
      }
    },
    productos: {
      [NAME]: 'productos',
      [COLS]: {
        id: { dataType: 'string', notNull: true },
        precioVentaActual: { dataType: 'number', notNull: true },
        notas: { dataType: 'string', notNull: false }
      }
    }
  }
  const types = deriveColumnTypes(schema).historial_precios

  it('las columnas integer de fecha se clasifican como timestamp, no como passthrough', () => {
    assert.equal(types.vigenteDesde, 'timestamp')
    assert.equal(types.vigenteHasta, 'timestamp')
    assert.equal(deriveColumnTypes(schema).productos.notas, 'passthrough')
  })

  it('deriveTimestampCols da las claves que hay que normalizar al escribir', () => {
    const cols = deriveTimestampCols(schema)
    assert.deepEqual(cols.historial_precios, ['vigenteDesde', 'vigenteHasta'])
    assert.equal(cols.productos, undefined)
  })

  it('al leer, un ISO guardado en la columna integer vuelve a ser epoch ms', () => {
    const fila = coerceRow(
      { id: 'h1', productoId: 'p1', vigenteDesde: '2026-07-11T19:13:55.004Z', vigenteHasta: null },
      types
    )
    assert.equal(fila.vigenteDesde, Date.parse('2026-07-11T19:13:55.004Z'))
    assert.equal(fila.vigenteHasta, null)
  })

  it('al leer, un epoch ms normal no se toca', () => {
    const fila = coerceRow({ id: 'h1', productoId: 'p1', vigenteDesde: 1770000000000, vigenteHasta: 1770000000001 }, types)
    assert.equal(fila.vigenteDesde, 1770000000000)
    assert.equal(fila.vigenteHasta, 1770000000001)
  })

  it('un ISO ilegible sobrevive la lectura (no se convierte en NaN)', () => {
    const fila = coerceRow({ id: 'h1', productoId: 'p1', vigenteDesde: 'basura', vigenteHasta: null }, types)
    assert.equal(fila.vigenteDesde, 'basura')
  })

  it('el caso 1299 contra SQLite real: sin normalizar revienta, normalizado no', () => {
    const db = new DatabaseSync(':memory:')
    db.exec('CREATE TABLE historial_precios (id TEXT PRIMARY KEY, vigente_desde INTEGER NOT NULL, vigente_hasta INTEGER)')
    const iso = '2026-07-11T19:13:55.004Z'

    // Lo que pasaba: la fecha se aritmética con Number() y sale NaN → NULL.
    assert.throws(
      () => db.prepare('INSERT INTO historial_precios (id, vigente_desde) VALUES (?, ?)').run('roto', Number(iso)),
      /NOT NULL constraint failed/
    )

    // Lo de ahora: la capa de escritura normaliza antes de tocar la columna.
    const fila = normalizarFechas({ id: 'ok', vigenteDesde: iso, vigenteHasta: null }, ['vigenteDesde', 'vigenteHasta'])
    db.prepare('INSERT INTO historial_precios (id, vigente_desde, vigente_hasta) VALUES (?, ?, ?)')
      .run(fila.id, fila.vigenteDesde, fila.vigenteHasta)
    const guardada = db.prepare('SELECT * FROM historial_precios WHERE id = ?').get('ok')
    assert.equal(typeof guardada.vigente_desde, 'number')
    assert.equal(guardada.vigente_desde, Date.parse(iso))
    assert.equal(guardada.vigente_hasta, null)
  })
})

// --- Mutación de productos: el precio que se revierte tras el push ---
describe('updateProductoMut', () => {
  const auth = { usuarioActual: { value: { id: 'u1' } } }

  function ctxFalso(producto, historial = []) {
    const tablas = { productos: [producto], historial_precios: historial }
    return {
      tablas,
      ctx: {
        async insert(t, data) {
          const row = { id: data.id ?? `${t}-nuevo`, ...data }
          tablas[t].push(row)
          return row
        },
        async update(t, id, cambios) {
          const row = tablas[t].find(r => r.id === id)
          if (row) Object.assign(row, cambios)
          return row
        },
        async get(t, id) {
          return tablas[t].find(r => r.id === id) ?? null
        },
        async queryAll(t) {
          return [...tablas[t]]
        },
        async findHistorialAbiertos(productoId) {
          return tablas.historial_precios.filter(h => h.productoId === productoId && h.vigenteHasta == null)
        }
      }
    }
  }

  it('cierra TODAS las filas abiertas del producto, no solo la primera', async () => {
    const { ctx, tablas } = ctxFalso({ id: 'p1', precioVentaActual: 10, precioCompraActual: 5 }, [
      { id: 'h1', productoId: 'p1', vigenteDesde: 1000, vigenteHasta: null },
      { id: 'h2', productoId: 'p1', vigenteDesde: 2000, vigenteHasta: null },
      { id: 'h3', productoId: 'p1', vigenteDesde: 3000, vigenteHasta: null }
    ])
    await updateProductoMut(ctx, 'p1', { precioVentaActual: 12 }, auth)
    const abiertos = tablas.historial_precios.filter(h => h.vigenteHasta == null)
    assert.equal(abiertos.length, 1, 'solo la fila nueva queda vigente')
    assert.equal(abiertos[0].precioVenta, 12)
    for (const cerrada of ['h1', 'h2', 'h3']) {
      const fila = tablas.historial_precios.find(h => h.id === cerrada)
      assert.ok(fila.vigenteHasta != null, `${cerrada} debería quedar cerrada`)
      assert.ok(fila.vigenteHasta >= fila.vigenteDesde, `${cerrada} con rango invertido`)
    }
  })

  it('un vigenteDesde ISO no se convierte en NaN (el error 1299)', async () => {
    const iso = '2026-07-11T19:13:55.004Z'
    const { ctx, tablas } = ctxFalso({ id: 'p1', precioVentaActual: 10, precioCompraActual: 5 }, [
      { id: 'h1', productoId: 'p1', vigenteDesde: iso, vigenteHasta: null }
    ])
    await updateProductoMut(ctx, 'p1', { precioVentaActual: 12 }, auth)
    const nueva = tablas.historial_precios.at(-1)
    assert.equal(Number.isFinite(nueva.vigenteDesde), true, 'vigenteDesde debe ser un número, no NaN')
    assert.ok(nueva.vigenteDesde > Date.parse(iso), 'el rango nuevo empieza después de la abierta')
  })

  it('sin cambio de precio no toca el historial', async () => {
    const { ctx, tablas } = ctxFalso({ id: 'p1', precioVentaActual: 10, precioCompraActual: 5 }, [
      { id: 'h1', productoId: 'p1', vigenteDesde: 1000, vigenteHasta: null }
    ])
    await updateProductoMut(ctx, 'p1', { precioVentaActual: 10, notas: 'otra cosa' }, auth)
    assert.equal(tablas.historial_precios.length, 1)
    assert.equal(tablas.historial_precios[0].vigenteHasta, null)
    assert.equal(tablas.productos[0].notas, 'otra cosa')
  })

  it('el precio de compra lo siguen gobernando los lotes', async () => {
    const { ctx, tablas } = ctxFalso({ id: 'p1', precioVentaActual: 10, precioCompraActual: 5 })
    await updateProductoMut(ctx, 'p1', { precioCompraActual: 99 }, auth)
    assert.equal(tablas.productos[0].precioCompraActual, 5)
    assert.equal(tablas.historial_precios.length, 0, 'no hay rotación por precio de compra')
  })
})
