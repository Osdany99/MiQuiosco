/**
 * server/utils/inventario.ts — Puente de tipos entre los constructores de
 * shared/inventario (JS sin tipos) y las tablas Drizzle.
 *
 * Los constructores ya validan y normalizan los datos (ver Zod en
 * shared/schemas); aquí solo se les da la forma que Drizzle espera para
 * insertar, sin revalidar ni duplicar reglas de negocio.
 */
import type { movimientosInventario } from '../database/schema'

type InsertMovimiento = typeof movimientosInventario.$inferInsert

/** Columnas de timestamp de movimientos_inventario. */
const COLUMNAS_FECHA = ['creadoEn', 'actualizadoEn', 'anuladoEn'] as const

/**
 * Los movimientos se construyen en JS plano, donde `tipo` se widen a string y
 * el id es un string cualquiera. Además los constructores work en epoch
 * (número de ms) porque es lo que espera el sqlite local (`timestamp_ms`),
 * mientras que Postgres exige objetos Date: aquí se traduce.
 */
export function comoMovimiento(mov: Record<string, unknown>): InsertMovimiento {
  const out: Record<string, unknown> = { ...mov }
  for (const col of COLUMNAS_FECHA) {
    const v = out[col]
    if (typeof v === 'number' && Number.isFinite(v)) out[col] = new Date(v)
  }
  return out as unknown as InsertMovimiento
}

export interface RotacionPrecio {
  /** La primera fila abierta que se cierra (contrato de siempre). */
  cerrarId: string | null
  cerrarHasta: number | null
  /** Todas las filas abiertas que se cierran: la regla es una sola vigente. */
  cierres: Array<{ id: string, hasta: number }>
  nuevoHistorial: {
    productoId: string
    precioCompra: number
    precioVenta: number
    vigenteDesde: number
    vigenteHasta: null
    cambiadoPor: string | null
    creadoEn: number
    actualizadoEn: number
  }
  espejo: number
}

/** `rotarPrecioCompra` devuelve null cuando el precio no cambia. */
export function comoRotacionPrecio(rot: unknown): RotacionPrecio | null {
  return rot as RotacionPrecio | null
}

/** Una línea de venta directa: producto, precio de venta y el costo FIFO que consumió. */
export interface ItemVentaDirecta {
  id: string
  productoId: string
  cantidad: number
  precioVentaUsado: number
  subtotal: number
  costoUnitario: number
  costoTotal: number
  secuencia: number
  creadoEn: number
}

export interface ResultadoVentaDirecta {
  items: ItemVentaDirecta[]
  movimientos: Record<string, unknown>[]
  montoTotal: number
  costoTotal: number
  ganancia: number
  faltantes: Array<{ lineaId?: string, productoId: string, faltante: number }>
}

/**
 * `construirVentaDirecta` es JS sin tipos; los errores de faltantes se
 * revisan antes de escribir, así que aquí solo se estrecha la forma.
 */
export function comoVentaDirecta(v: unknown): ResultadoVentaDirecta {
  return v as ResultadoVentaDirecta
}
