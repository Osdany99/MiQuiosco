/* eslint-disable @typescript-eslint/no-explicit-any */
import { and, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../database/client'
import {
  clientes,
  cuadres,
  cuentasFiado,
  cuentasFiadoItems,
  lotes,
  movimientosInventario,
  productos,
  transferencias
} from '../database/schema'
import type { AuthContext } from './auth'
import { exigirPermiso } from './permisos'
import { comoMovimiento, conGuardaStock } from './inventario'
import {
  CLIENTE_SIN_CLIENTE_NOMBRE,
  CLIENTE_SIN_CLIENTE_NOTAS
} from '#shared/constants'
import { cuentaFiadoCoincide, importeCentavos, transferenciaCoincide } from '#shared/fiadoIdempotencia'
import { construirVentaDirecta, lotesConSaldo } from '#shared/inventario/operaciones'

const TABLAS_PERMITIDAS = [
  'clientes', 'cuadres', 'cuentas_fiado', 'cuentas_fiado_items',
  'movimientos_inventario', 'transferencias'
] as const

function fallo(statusCode: number, statusMessage: string): never {
  throw createError({ statusCode, statusMessage })
}

function idDe(row: any, tabla: string): string {
  const id = String(row?.id ?? '')
  if (!id) fallo(400, `Falta el ID en ${tabla}.`)
  return id
}

function comprobarPuesto(row: any, puestoId: string, tabla: string): void {
  if (row?.puestoId && row.puestoId !== puestoId) {
    fallo(403, `La fila de ${tabla} pertenece a otro puesto.`)
  }
}

function propia(row: any, puestoId: string, tabla: string): any {
  if (!row) fallo(404, `${tabla} no encontrada.`)
  if (row.puestoId !== puestoId) fallo(403, `La fila de ${tabla} pertenece a otro puesto.`)
  return row
}

function positivo(valor: any, entero = false): number {
  const n = Number(valor)
  if (!Number.isFinite(n) || n <= 0 || (entero && !Number.isInteger(n))) return 0
  return n
}

function fechaDe(valor: any, fallback = new Date()): Date {
  if (valor instanceof Date && Number.isFinite(valor.getTime())) return valor
  const ms = typeof valor === 'number' ? valor : Date.parse(String(valor ?? ''))
  return Number.isFinite(ms) ? new Date(ms) : fallback
}

function mismoImporte(a: any, b: any): boolean {
  return importeCentavos(a) === importeCentavos(b)
}

async function porId(tx: any, tabla: any, id: string): Promise<any> {
  const [row] = await tx.select().from(tabla).where(eq(tabla.id, id)).limit(1)
  return row ?? null
}

async function clienteOperativo(tx: any, id: string, puestoId: string): Promise<any> {
  const cliente = propia(await porId(tx, clientes, id), puestoId, 'clientes')
  if (!cliente.activo || cliente.fusionadoEn) fallo(409, 'El cliente no está activo.')
  return cliente
}

async function cuadreAbierto(tx: any, id: string, puestoId: string): Promise<any> {
  const cuadre = propia(await porId(tx, cuadres, id), puestoId, 'cuadres')
  if (cuadre.estado !== 'abierto') fallo(409, 'El cuadre está cerrado.')
  return cuadre
}

function movimientosDeCuenta(movimientos: any[], itemIds: Set<string>): any[] {
  return movimientos.filter(m => m?.cuentaFiadoItemId && itemIds.has(m.cuentaFiadoItemId))
}

function ubicacionDe(movimientos: any[]): 'almacen' | 'quiosco' {
  const ubicaciones = new Set<string>()
  for (const m of movimientos) {
    const almacen = Number(m?.deltaAlmacen) || 0
    const quiosco = Number(m?.deltaQuiosco) || 0
    if (almacen < 0 && quiosco === 0) ubicaciones.add('almacen')
    else if (quiosco < 0 && almacen === 0) ubicaciones.add('quiosco')
    else fallo(409, 'Los movimientos del fiado no tienen deltas válidos.')
  }
  if (ubicaciones.size !== 1) fallo(409, 'El fiado debe usar una única ubicación.')
  return [...ubicaciones][0] as 'almacen' | 'quiosco'
}

function mismoMovimiento(actual: any, esperado: any): boolean {
  return actual?.anulado === false
    && actual?.productoId === esperado.productoId
    && (actual?.loteId ?? null) === (esperado.loteId ?? null)
    && actual?.cuentaFiadoItemId === esperado.cuentaFiadoItemId
    && actual?.tipo === 'venta'
    && Number(actual?.cantidad) === Number(esperado.cantidad)
    && Number(actual?.deltaAlmacen) === Number(esperado.deltaAlmacen)
    && Number(actual?.deltaQuiosco) === Number(esperado.deltaQuiosco)
    && mismoImporte(actual?.precioUnitario, esperado.precioUnitario)
    && mismoImporte(actual?.importe, esperado.importe)
    && (actual?.motivo ?? null) === (esperado.motivo ?? null)
}

function compararReplayDirecto(
  cuenta: any,
  items: any[],
  movimientos: any[],
  itemsServidor: any[],
  movimientosServidor: any[]
): void {
  const itemsPorId = new Map(itemsServidor.map(i => [i.id, i]))
  for (const item of items) {
    const previo = itemsPorId.get(idDe(item, 'cuentas_fiado_items'))
    if (!previo || previo.cuentaFiadoId !== cuenta.id
      || previo.productoId !== item.productoId
      || Number(previo.cantidad) !== Number(item.cantidad)
      || !mismoImporte(previo.precioVentaUsado, item.precioVentaUsado)
      || !mismoImporte(previo.subtotal, item.subtotal)) {
      fallo(409, 'El ID de la deuda ya se usó con otras líneas.')
    }
  }
  const movsPorId = new Map(movimientosServidor.map(m => [m.id, m]))
  for (const mov of movimientos) {
    const previo = movsPorId.get(idDe(mov, 'movimientos_inventario'))
    if (!previo || !mismoMovimiento(mov, previo)) {
      fallo(409, 'El ID de la deuda ya se usó con otros movimientos.')
    }
  }
}

async function replayCuenta(
  tx: any,
  cuenta: any,
  previa: any,
  items: any[],
  movimientos: any[],
  aceptados: string[]
): Promise<void> {
  if (!cuentaFiadoCoincide(previa, {
    clienteId: cuenta.clienteId,
    cuadreOrigenId: cuenta.cuadreOrigenId ?? null,
    montoTotal: cuenta.montoTotal
  })) {
    fallo(409, 'El ID de la deuda ya se usó con otros datos.')
  }

  const itemsServidor: any[] = await tx.select().from(cuentasFiadoItems)
    .where(eq(cuentasFiadoItems.cuentaFiadoId, previa.id))
  const itemIds = itemsServidor.map(i => i.id)
  const movimientosServidor: any[] = itemIds.length
    ? await tx.select().from(movimientosInventario)
        .where(inArray(movimientosInventario.cuentaFiadoItemId, itemIds))
    : []

  if (previa.cuadreOrigenId) {
    if (items.length || movimientos.length) {
      fallo(409, 'La deuda de dinero no admite productos ni movimientos.')
    }
  } else {
    compararReplayDirecto(previa, items, movimientos, itemsServidor, movimientosServidor)
  }
  aceptados.push(previa.id, ...items.map(i => i.id), ...movimientos.map(m => m.id))
}

async function insertarDeudaDinero(
  tx: any,
  cuenta: any,
  puestoId: string,
  aceptados: string[]
): Promise<void> {
  const total = positivo(cuenta.montoTotal)
  if (!total) fallo(409, 'La deuda de dinero debe tener un importe positivo.')
  await clienteOperativo(tx, cuenta.clienteId, puestoId)
  await cuadreAbierto(tx, cuenta.cuadreOrigenId, puestoId)

  const creadoEn = fechaDe(cuenta.creadoEn)
  await tx.insert(cuentasFiado).values({
    id: cuenta.id,
    puestoId,
    clienteId: cuenta.clienteId,
    cuadreOrigenId: cuenta.cuadreOrigenId,
    montoTotal: total,
    montoPagado: 0,
    costoTotal: null,
    ganancia: null,
    estado: 'pendiente',
    creadoEn,
    actualizadoEn: fechaDe(cuenta.actualizadoEn, creadoEn)
  })
  await tx.update(cuadres).set({
    montoFiado: sql`${cuadres.montoFiado} + ${total}`,
    actualizadoEn: new Date()
  }).where(eq(cuadres.id, cuenta.cuadreOrigenId))
  aceptados.push(cuenta.id)
}

async function insertarDeudaDirecta(
  tx: any,
  cuenta: any,
  items: any[],
  movimientos: any[],
  auth: AuthContext,
  aceptados: string[]
): Promise<void> {
  const puestoId = auth.usuario.puestoId
  const usuarioId = auth.usuario.id
  if (!items.length || !movimientos.length) {
    fallo(409, 'El fiado directo necesita líneas y movimientos FIFO.')
  }
  const ubicacion = ubicacionDe(movimientos)
  await exigirPermiso(auth, `acciones.${ubicacion}.voz`)
  await clienteOperativo(tx, cuenta.clienteId, puestoId)

  const idsProductos = [...new Set(items.map(i => i.productoId))]
  const [filasLotes, movs, prods]: [any[], any[], any[]] = await Promise.all([
    tx.select().from(lotes).where(and(eq(lotes.puestoId, puestoId), eq(lotes.anulado, false))),
    tx.select().from(movimientosInventario).where(and(
      eq(movimientosInventario.puestoId, puestoId), eq(movimientosInventario.anulado, false)
    )),
    tx.select().from(productos).where(inArray(productos.id, idsProductos))
  ])
  const productosPorId = new Map(prods.map(p => [p.id, p]))
  for (const id of idsProductos) {
    const producto = productosPorId.get(id)
    if (!producto) fallo(404, 'Producto no encontrado.')
    if (producto.puestoId !== puestoId) fallo(403, 'El producto pertenece a otro puesto.')
  }
  const lotesPorProducto = new Map(idsProductos.map(id => [
    id, lotesConSaldo(filasLotes, movs, id, ubicacion)
  ]))
  const plan: any = construirVentaDirecta({
    lineas: items,
    lotesPorProducto,
    ubicacion,
    motivo: ubicacion === 'almacen' ? 'deuda_directa_almacen' : 'deuda_directa_quiosco',
    meta: { puestoId, usuarioId, ahora: fechaDe(cuenta.creadoEn).getTime() }
  })
  if (plan.faltantes.length || plan.items.length !== items.length) {
    fallo(409, 'Otra operación consumió el stock primero. Revisa el disponible y vuelve a intentarlo.')
  }
  if (!mismoImporte(cuenta.montoTotal, plan.montoTotal)) {
    fallo(409, 'El total de la deuda no coincide con sus líneas.')
  }

  const itemsPlanPorId = new Map<string, any>(plan.items.map((i: any) => [i.id, i] as [string, any]))
  for (const item of items) {
    const esperado = itemsPlanPorId.get(idDe(item, 'cuentas_fiado_items'))
    if (!esperado || esperado.productoId !== item.productoId
      || Number(esperado.cantidad) !== Number(item.cantidad)
      || !mismoImporte(esperado.precioVentaUsado, item.precioVentaUsado)
      || !mismoImporte(esperado.subtotal, item.subtotal)) {
      fallo(409, 'Las líneas del fiado no son coherentes.')
    }
  }

  const usados = new Set<string>()
  const movimientosFinales = plan.movimientos.map((esperado: any) => {
    const original = movimientos.find(m => !usados.has(m.id) && mismoMovimiento(m, esperado))
    if (!original) fallo(409, 'El FIFO del fiado ya no coincide con el stock disponible.')
    usados.add(original.id)
    return {
      ...esperado,
      id: idDe(original, 'movimientos_inventario'),
      puestoId,
      usuarioId,
      creadoEn: fechaDe(original.creadoEn, fechaDe(cuenta.creadoEn)),
      actualizadoEn: fechaDe(original.actualizadoEn, fechaDe(cuenta.actualizadoEn))
    }
  })
  if (usados.size !== movimientos.length) {
    fallo(409, 'Hay movimientos que no pertenecen al FIFO del fiado.')
  }

  const creadoEn = fechaDe(cuenta.creadoEn)
  await tx.insert(cuentasFiado).values({
    id: cuenta.id,
    puestoId,
    clienteId: cuenta.clienteId,
    cuadreOrigenId: null,
    montoTotal: plan.montoTotal,
    montoPagado: 0,
    costoTotal: plan.costoTotal,
    ganancia: plan.ganancia,
    estado: 'pendiente',
    creadoEn,
    actualizadoEn: fechaDe(cuenta.actualizadoEn, creadoEn)
  })
  for (const item of plan.items) {
    await tx.insert(cuentasFiadoItems).values({
      id: item.id,
      cuentaFiadoId: cuenta.id,
      productoId: item.productoId,
      cantidad: item.cantidad,
      precioVentaUsado: item.precioVentaUsado,
      subtotal: item.subtotal,
      creadoEn: fechaDe(items.find(i => i.id === item.id)?.creadoEn, creadoEn)
    })
  }
  for (const mov of movimientosFinales) {
    await tx.insert(movimientosInventario).values(comoMovimiento(mov))
  }
  aceptados.push(cuenta.id, ...items.map(i => i.id), ...movimientos.map(m => m.id))
}

async function procesarClientes(tx: any, filas: any[], puestoId: string, aceptados: string[]): Promise<void> {
  const vistos = new Set<string>()
  for (const fila of filas) {
    const id = idDe(fila, 'clientes')
    if (vistos.has(id)) fallo(409, 'El cliente centinela viene duplicado.')
    vistos.add(id)
    comprobarPuesto(fila, puestoId, 'clientes')
    if (fila.nombre !== CLIENTE_SIN_CLIENTE_NOMBRE || fila.esCentinela !== true || fila.activo === false) {
      fallo(403, 'El trabajador solo puede reparar el cliente centinela.')
    }
    const previo = await porId(tx, clientes, id)
    if (previo) {
      propia(previo, puestoId, 'clientes')
      if (!previo.esCentinela || previo.nombre !== CLIENTE_SIN_CLIENTE_NOMBRE || !previo.activo) {
        fallo(409, 'El ID del centinela ya pertenece a otro cliente.')
      }
    } else {
      const creadoEn = fechaDe(fila.creadoEn)
      await tx.insert(clientes).values({
        id,
        puestoId,
        nombre: CLIENTE_SIN_CLIENTE_NOMBRE,
        notas: CLIENTE_SIN_CLIENTE_NOTAS,
        activo: true,
        esCentinela: true,
        fusionadoEn: null,
        creadoEn,
        actualizadoEn: fechaDe(fila.actualizadoEn, creadoEn)
      })
    }
    aceptados.push(id)
  }
}

async function procesarTransferencias(
  tx: any,
  filas: any[],
  puestoId: string,
  aceptados: string[]
): Promise<void> {
  const vistos = new Set<string>()
  for (const fila of filas) {
    const id = idDe(fila, 'transferencias')
    if (vistos.has(id)) fallo(409, 'La transferencia viene duplicada.')
    vistos.add(id)
    comprobarPuesto(fila, puestoId, 'transferencias')
    const total = positivo(fila.montoTotal)
    if (!total) fallo(409, 'La transferencia debe tener un importe positivo.')
    const previa = await porId(tx, transferencias, id)
    if (previa) {
      propia(previa, puestoId, 'transferencias')
      if (!transferenciaCoincide(previa, {
        clienteId: fila.clienteId, cuadreId: fila.cuadreId, montoTotal: total
      })) {
        fallo(409, 'El ID de la transferencia ya se usó con otros datos.')
      }
      aceptados.push(id)
      continue
    }

    await clienteOperativo(tx, fila.clienteId, puestoId)
    await cuadreAbierto(tx, fila.cuadreId, puestoId)
    const creadoEn = fechaDe(fila.creadoEn)
    await tx.insert(transferencias).values({
      id,
      puestoId,
      clienteId: fila.clienteId,
      cuadreId: fila.cuadreId,
      montoTotal: total,
      creadoEn,
      actualizadoEn: fechaDe(fila.actualizadoEn, creadoEn)
    })
    await tx.update(cuadres).set({
      montoTransferencia: sql`${cuadres.montoTransferencia} + ${total}`,
      actualizadoEn: new Date()
    }).where(eq(cuadres.id, fila.cuadreId))
    aceptados.push(id)
  }
}

/** Push acotado del trabajador: una operación completa o rollback, nunca LWW. */
export async function aplicarPushTrabajador(data: Record<string, any>, auth: AuthContext) {
  const puestoId = auth.usuario.puestoId
  const filasClientes = data.clientes ?? []
  const filasCuadres = data.cuadres ?? []
  const filasCuentas = data.cuentas_fiado ?? []
  const filasItems = data.cuentas_fiado_items ?? []
  const filasMovimientos = data.movimientos_inventario ?? []
  const filasTransferencias = data.transferencias ?? []
  const total = TABLAS_PERMITIDAS.reduce((n, tabla) => n + (data[tabla]?.length ?? 0), 0)
  if (total > 1000) fallo(413, 'Demasiadas filas en el push del trabajador.')

  if (filasCuentas.length || filasItems.length || filasMovimientos.length) {
    await exigirPermiso(auth, 'acciones.cuadre.fiar')
  }
  if (filasTransferencias.length) await exigirPermiso(auth, 'acciones.cuadre.transferencia')
  if (filasClientes.length) {
    await exigirPermiso(auth, ['acciones.cuadre.fiar', 'acciones.cuadre.transferencia'], { cualquiera: true })
  }

  return await conGuardaStock(() => db.transaction(async (tx) => {
    const aceptados: string[] = []
    await procesarClientes(tx, filasClientes, puestoId, aceptados)

    const itemsPorCuenta = new Map<string, any[]>()
    for (const item of filasItems) {
      idDe(item, 'cuentas_fiado_items')
      const lista = itemsPorCuenta.get(item.cuentaFiadoId) ?? []
      lista.push(item)
      itemsPorCuenta.set(item.cuentaFiadoId, lista)
    }
    const cuentasPorId = new Map<string, any>()
    for (const cuenta of filasCuentas) {
      const id = idDe(cuenta, 'cuentas_fiado')
      if (cuentasPorId.has(id)) fallo(409, 'La deuda viene duplicada.')
      cuentasPorId.set(id, cuenta)
    }
    for (const cuentaId of itemsPorCuenta.keys()) {
      if (!cuentasPorId.has(cuentaId)) fallo(400, 'Falta la cabecera de una deuda.')
    }

    for (const cuenta of filasCuentas) {
      comprobarPuesto(cuenta, puestoId, 'cuentas_fiado')
      if (Number(cuenta.montoPagado) !== 0 || cuenta.estado !== 'pendiente') {
        fallo(403, 'El trabajador no puede sincronizar cobros ni cambiar el estado de una deuda.')
      }
      const items = itemsPorCuenta.get(cuenta.id) ?? []
      const itemIds = new Set(items.map(i => i.id))
      const movimientos = movimientosDeCuenta(filasMovimientos, itemIds)
      const previa = await porId(tx, cuentasFiado, cuenta.id)
      if (previa) {
        propia(previa, puestoId, 'cuentas_fiado')
        await replayCuenta(tx, cuenta, previa, items, movimientos, aceptados)
      } else if (cuenta.cuadreOrigenId) {
        if (items.length || movimientos.length) {
          fallo(409, 'La deuda de dinero no admite productos ni movimientos.')
        }
        await insertarDeudaDinero(tx, cuenta, puestoId, aceptados)
      } else {
        await insertarDeudaDirecta(tx, cuenta, items, movimientos, auth, aceptados)
      }
    }

    const movimientosReconocidos = new Set(
      filasMovimientos.filter((m: any) => {
        const item = filasItems.find((i: any) => i.id === m?.cuentaFiadoItemId)
        return !!item && cuentasPorId.has(item.cuentaFiadoId)
      }).map((m: any) => m.id)
    )
    if (movimientosReconocidos.size !== filasMovimientos.length) {
      fallo(400, 'Hay movimientos sin su deuda y línea asociadas.')
    }

    await procesarTransferencias(tx, filasTransferencias, puestoId, aceptados)

    for (const fila of filasCuadres) {
      const id = idDe(fila, 'cuadres')
      comprobarPuesto(fila, puestoId, 'cuadres')
      propia(await porId(tx, cuadres, id), puestoId, 'cuadres')
      // Nunca se aceptan importes/estado del cliente: solo se calculó el delta
      // de las operaciones nuevas. Una fila ya existente es autoritativa.
      aceptados.push(id)
    }

    return { aceptados, conflictos: {}, rechazos: [], deletesAceptados: [] }
  }))
}
