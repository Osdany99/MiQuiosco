/**
 * scripts/reparar-reaperturas.mjs — Auditoría y reparación del descuadre de
 * inventario causado por las reaperturas repetidas de un cuadre.
 *
 * EL FALLO QUE ARREGLA
 * Al reabrir un cuadre, la app devuelve al quiosco el stock de las ventas de
 * ESE cierre con contramovimientos (tipo 'anulacion'). Una venta ya devuelta
 * sigue en el libro con `anulado = false` (el original nunca se marca: es su
 * contraparte la que lo cancela), así que una segunda reapertura confundía
 * "no anulada" con "viva" y volvía a devolver el mismo stock. Resultado: la
 * venta del día dejaba de descontarse del quiosco, o lo inflaba.
 *
 * Este script usa la MISMA regla que la app (auditarAnulacionesCuadre de
 * shared/inventario/operaciones.js), nunca una copia: lo que el script llama
 * venta viva es exactamente lo que la app habría devuelto.
 *
 * USO
 *   node scripts/reparar-reaperturas.mjs <base.db>            auditoría (no escribe)
 *   node scripts/reparar-reaperturas.mjs <base.db> --apply    repara (backup + 1 transacción)
 *
 * La auditoría no modifica nada: sirve para comprobar cualquier copia de la
 * base antes de decidir. La reparación marca `anulado = 1` en las anulaciones
 * sobrantes (no las borra: el rastro queda) y bumpea `actualizado_en` para que
 * el flag viaje al servidor en el próximo sincronizado.
 *
 * IMPORTANTE: repara ANTES de sincronizar. Las anulaciones sobrantes todavía
 * no viajan al servidor, pero una vez pushadas habría que arreglar también la
 * base del servidor.
 */
import { DatabaseSync } from 'node:sqlite'
import { copyFileSync, existsSync } from 'node:fs'
import { basename } from 'node:path'
import { auditarAnulacionesCuadre } from '../shared/inventario/operaciones.js'

const args = process.argv.slice(2)
const ruta = args.find(a => !a.startsWith('--'))
const aplicar = args.includes('--apply')

if (!ruta || !existsSync(ruta)) {
  console.error('Uso: node scripts/reparar-reaperturas.mjs <base.db> [--apply]')
  process.exit(1)
}

// --------------------------------------------------------------- helpers ----

/** Fila de sqlite (snake_case) → objeto que espera el código de dominio. */
function comoMovimiento(f) {
  return {
    id: f.id,
    puestoId: f.puesto_id,
    productoId: f.producto_id,
    loteId: f.lote_id,
    cuadreId: f.cuadre_id,
    lineaCuadreId: f.linea_cuadre_id,
    tipo: f.tipo,
    cantidad: f.cantidad,
    deltaAlmacen: f.delta_almacen,
    deltaQuiosco: f.delta_quiosco,
    precioUnitario: f.precio_unitario,
    importe: f.importe,
    usuarioId: f.usuario_id,
    anulado: !!f.anulado,
    creadoEn: f.creado_en
  }
}

/** Los cuadres cerrados: son los únicos que deben cuadrar contra el libro.
 *  Un cuadre abierto todavía no ha descontado su venta (se descontará al
 *  cerrarse), así que su descuadre es lo normal y no se audita. */
function cuadresCerrados(db) {
  return db.prepare(`
    select c.id, c.fecha, c.reabierto_veces,
      (select ifnull(sum(i.cantidad), 0) from cuadre_items i
        where i.cuadre_id = c.id and i.cantidad > 0) as vendido
    from cuadres c
    where c.estado = 'cerrado'
    order by c.fecha, c.creado_en
  `).all()
}

function movimientosDe(db, cuadreId) {
  return db.prepare(`
    select * from movimientos_inventario
    where cuadre_id = ? and anulado = 0
    order by creado_en
  `).all(cuadreId).map(comoMovimiento)
}

/**
 * Por producto, cuánto se vendió en el cuadre frente a lo que el libro
 * descontó del quiosco. El descuadre es la diferencia: positivo = el quiosco
 * quedó con más mercadería de la que debería.
 */
function detallePorProducto(db, cuadreId) {
  const delta = new Map()
  for (const f of db.prepare(`
    select producto_id, ifnull(sum(delta_quiosco), 0) as dq
    from movimientos_inventario
    where cuadre_id = ? and anulado = 0
    group by producto_id
  `).all(cuadreId)) {
    delta.set(f.producto_id, -Math.trunc(Number(f.dq) || 0))
  }
  const vendido = new Map()
  for (const f of db.prepare(`
    select producto_id, ifnull(sum(cantidad), 0) as c
    from cuadre_items
    where cuadre_id = ? and cantidad > 0
    group by producto_id
  `).all(cuadreId)) {
    vendido.set(f.producto_id, Math.trunc(Number(f.c) || 0))
  }

  const ids = new Set([...vendido.keys(), ...delta.keys()])
  const salida = []
  for (const pid of ids) {
    const esperado = vendido.get(pid) ?? 0
    const real = delta.get(pid) ?? 0
    if (esperado === real) continue
    salida.push({ productoId: pid, unidades: esperado - real })
  }
  return salida.sort((a, b) => b.unidades - a.unidades)
}

// ------------------------------------------------------------ diagnóstico ----

/**
 * Cuadra cada cuadre cerrado contra lo que dicen haber vendido sus líneas.
 *
 *   esperado = lo vendido (el quiosco va con signo -)
 *   real     = lo que el libro dejó en el quiosco (ventas + anulaciones netas)
 *
 * Si difieren, el inventario de ese día está mal. Si además hay anulaciones
 * sobrantes, sabemos exactamente dónde está el error y se puede arreglar.
 */
function diagnosticar(db) {
  const nombres = new Map(
    db.prepare('select id, nombre from productos').all().map(f => [f.id, f.nombre])
  )

  const hallazgos = []
  for (const c of cuadresCerrados(db)) {
    const movs = movimientosDe(db, c.id)
    // `vivas` no se usa aquí: el detalle sale de comparar las líneas del cuadre
    // con lo que el libro descontó (detallePorProducto), que speak del mismo
    // descuadre visto por producto.
    const { sobrantes } = auditarAnulacionesCuadre(movs)

    const esperado = -Number(c.vendido || 0)
    const real = movs.reduce((s, m) => s + Math.trunc(Number(m.deltaQuiosco) || 0), 0)
    const diferencia = esperado - real
    if (diferencia === 0 && sobrantes.length === 0) continue

    hallazgos.push({
      cuadre: c,
      esperado,
      real,
      diferencia,
      sobrantes,
      reparable: sobrantes.length > 0 && diferencia !== 0,
      detalle: detallePorProducto(db, c.id)
        .map(d => ({ nombre: nombres.get(d.productoId) ?? d.productoId.slice(0, 8), unidades: d.unidades }))
    })
  }
  return hallazgos
}

// ---------------------------------------------------------------- informe ----

function imprimirInforme(hallazgos) {
  if (hallazgos.length === 0) {
    console.log('\n  OK: todos los cuadres cerrados cuadran con el libro de inventario.\n')
    return
  }

  console.log(`\n  Descuadre en ${hallazgos.length} cuadre(s):\n`)
  for (const h of hallazgos) {
    const c = h.cuadre
    const signo = h.diferencia > 0 ? 'NO descontado del quiosco' : 'sobrante en el quiosco'
    console.log(`  · ${c.fecha}  cuadre ${c.id.slice(0, 8)}  (reaperturas: ${c.reabierto_veces})`)
    console.log(`      vendido en el cuadre : ${c.vendido} uds  →  quiosco esperado ${h.esperado}`)
    console.log(`      libro de inventario  : ${h.real} uds`)
    console.log(`      ${signo}: ${Math.abs(h.diferencia)} uds`)
    console.log(`      anulaciones sobrantes: ${h.sobrantes.length}`)

    if (!h.reparable) {
      console.log('      no reparable: el descuadre no viene de reaperturas repetidas')
    } else {
      console.log('      uds de más por producto (lo que se va a corregir):')
      const TOP = 12
      for (const d of h.detalle.slice(0, TOP)) {
        console.log(`        ${String(d.unidades).padStart(4)}  ${d.nombre}`)
      }
      if (h.detalle.length > TOP) console.log(`        ... y ${h.detalle.length - TOP} producto(s) más`)
    }
    console.log('')
  }
}

// -------------------------------------------------------------- reparación ----

function reparar(hallazgos) {
  const reparables = hallazgos.filter(h => h.reparable)

  for (const h of hallazgos.filter(h => !h.reparable)) {
    console.log(`  · ${h.cuadre.fecha} ${h.cuadre.id.slice(0, 8)}: queda SIN reparar`)
    console.log('      (no hay anulaciones sobrantes: el descuadre tiene otra causa)\n')
  }

  if (reparables.length === 0) {
    console.log('  Nada que reparar.\n')
    return
  }

  // AAAAMMDD-HHMMSS. Sin milisegundos: el punto del ISO se colaría en el nombre.
  const sello = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')
  const backup = `${ruta}.bak-${sello}`
  copyFileSync(ruta, backup)
  console.log(`  Backup: ${basename(backup)}`)

  const db = new DatabaseSync(ruta)
  const update = db.prepare('update movimientos_inventario set anulado = 1, actualizado_en = ? where id = ?')
  const ahoraMs = Date.now()

  db.exec('BEGIN IMMEDIATE')
  try {
    let total = 0
    for (const h of reparables) {
      for (const m of h.sobrantes) {
        update.run(ahoraMs, m.id)
        total++
      }
      console.log(`  · ${h.cuadre.fecha} ${h.cuadre.id.slice(0, 8)}: ${h.sobrantes.length} anulaciones marcadas`)
    }
    db.exec('COMMIT')
    console.log(`\n  ${total} movimiento(s) corregidos.`)
  } catch (err) {
    db.exec('ROLLBACK')
    db.close()
    throw err
  }
  db.close()
}

// ------------------------------------------------------------------ main ----

if (aplicar) {
  const antes = diagnosticar(new DatabaseSync(ruta, { readOnly: true }))
  imprimirInforme(antes)
  reparar(antes)

  // Comprobación posterior sobre la base ya escrita: tiene que salir limpia.
  const restantes = diagnosticar(new DatabaseSync(ruta, { readOnly: true }))
  if (restantes.length === 0) {
    console.log('  Verificación: todos los cuadres cuadran con el libro.\n')
  } else {
    console.log(`  Verificación: siguen descuadrados ${restantes.length} cuadre(s).`)
    imprimirInforme(restantes)
  }
} else {
  const hallazgos = diagnosticar(new DatabaseSync(ruta, { readOnly: true }))
  imprimirInforme(hallazgos)
  if (hallazgos.some(h => h.reparable)) {
    console.log('  Modo auditoría: no se escribió nada. Para corregirlo, repite con --apply.\n')
  }
}
