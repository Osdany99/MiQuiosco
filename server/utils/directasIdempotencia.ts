/* eslint-disable @typescript-eslint/no-explicit-any */
import { eq, inArray } from 'drizzle-orm'
import {
  cuentasFiado,
  cuentasFiadoItems,
  movimientosInventario,
  pagosFiado,
  ventasDirectas,
  ventasDirectasItems
} from '../database/schema'
import { importeCentavos } from '#shared/fiadoIdempotencia'

function conflicto(tipo: string): never {
  throw createError({
    statusCode: 409,
    statusMessage: `El ID de ${tipo} ya se usó con otros datos.`
  })
}

function centavos(valor: any): number {
  return importeCentavos(valor)
}

function redondear2(valor: number): number {
  return Math.round(valor * 100) / 100
}

/**
 * Compara el efecto dictado, no el costo FIFO (este último depende del stock
 * en el momento de la primera escritura y no forma parte del payload).
 */
function lineasCoinciden(
  lineas: any[],
  items: any[],
  tipoVenta = 'directa',
  compararSecuencia = true
): boolean {
  const restantes = [...items]
  for (const linea of lineas) {
    const index = restantes.findIndex((item) => {
      if (linea.id && item.id !== linea.id) return false
      if (item.productoId !== linea.productoId) return false
      if (Number(item.cantidad) !== Number(linea.cantidad)) return false
      if (compararSecuencia && Number(item.secuencia ?? 0) !== Number(linea.secuencia ?? 0)) return false
      if (tipoVenta !== 'casa') {
        const precioEsperado = tipoVenta === 'regalo' ? 0 : Number(linea.precioVentaUsado)
        if (centavos(item.precioVentaUsado) !== centavos(precioEsperado)) return false
        if (centavos(item.subtotal) !== centavos(redondear2(Number(linea.cantidad) * precioEsperado))) return false
      }
      return true
    })
    if (index < 0) return false
    restantes.splice(index, 1)
  }
  return restantes.length === 0
}

function totalDictado(lineas: any[], tipoVenta: string): number | null {
  if (tipoVenta === 'casa') return null
  return redondear2(lineas.reduce((total, linea) => {
    const precio = tipoVenta === 'regalo' ? 0 : Number(linea.precioVentaUsado)
    return total + Number(linea.cantidad) * precio
  }, 0))
}

export async function ventaDirectaPrevia(
  db: any,
  id: string | null | undefined,
  datos: any,
  puestoId: string
): Promise<any | null> {
  if (!id) return null
  const [previa] = await db.select().from(ventasDirectas).where(eq(ventasDirectas.id, id)).limit(1)
  if (!previa) return null
  if (previa.puestoId !== puestoId
    || previa.ubicacionVenta !== datos.ubicacion
    || previa.tipoVenta !== datos.tipoVenta
    || (previa.clienteId ?? null) !== (datos.clienteId ?? null)
    || (previa.notas ?? null) !== (datos.notas ?? null)) {
    conflicto('la venta directa')
  }
  const items = await db.select().from(ventasDirectasItems).where(eq(ventasDirectasItems.ventaDirectaId, id))
  if (!lineasCoinciden(datos.lineas, items, datos.tipoVenta)) conflicto('la venta directa')
  const total = totalDictado(datos.lineas, datos.tipoVenta)
  if (total != null && centavos(previa.montoTotal) !== centavos(total)) conflicto('la venta directa')
  return previa
}

export async function deudaDirectaPrevia(
  db: any,
  id: string | null | undefined,
  datos: any,
  puestoId: string
): Promise<any | null> {
  if (!id) return null
  const [previa] = await db.select().from(cuentasFiado).where(eq(cuentasFiado.id, id)).limit(1)
  if (!previa) return null
  if (previa.puestoId !== puestoId
    || previa.clienteId !== datos.clienteId
    || previa.cuadreOrigenId != null) {
    conflicto('la deuda directa')
  }
  const items = await db.select().from(cuentasFiadoItems).where(eq(cuentasFiadoItems.cuentaFiadoId, id))
  if (!lineasCoinciden(datos.lineas, items, 'directa', false)) conflicto('la deuda directa')
  const total = totalDictado(datos.lineas, 'directa')
  if (centavos(previa.montoTotal) !== centavos(total)) conflicto('la deuda directa')

  const itemIds = items.map((item: any) => item.id)
  const movimientos = itemIds.length
    ? await db.select().from(movimientosInventario)
        .where(inArray(movimientosInventario.cuentaFiadoItemId, itemIds))
    : []
  const enAlmacen = movimientos.some((m: any) => Number(m.deltaAlmacen) < 0)
  const enQuiosco = movimientos.some((m: any) => Number(m.deltaQuiosco) < 0)
  if (!movimientos.length || enAlmacen === enQuiosco
    || (datos.ubicacion === 'almacen') !== enAlmacen) {
    conflicto('la deuda directa')
  }

  const inicial = Number(datos.montoPagadoInicial) || 0
  const pagos = await db.select().from(pagosFiado).where(eq(pagosFiado.cuentaFiadoId, id))
  if (inicial > 0) {
    const existeInicial = pagos.some((pago: any) => pago.cuadreId == null
      && pago.formaPago === datos.formaPagoInicial
      && centavos(pago.monto) === centavos(inicial))
    if (!existeInicial) conflicto('la deuda directa')
  } else if (pagos.length > 0) {
    // Sin un marcador de «pago inicial» no se puede distinguir un abono original
    // de un cobro posterior: fail-closed antes que aceptar un payload distinto.
    conflicto('la deuda directa')
  }
  return previa
}
