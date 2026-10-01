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

/**
 * Los movimientos se construyen en JS plano, donde `tipo` se widen a string y
 * el id es un string cualquiera. Este cast los narrowly-tipa a la unión del
 * enum y al resto de columnas de la tabla.
 */
export function comoMovimiento(mov: Record<string, unknown>): InsertMovimiento {
  return mov as unknown as InsertMovimiento
}

export interface RotacionPrecio {
  cerrarId: string | null
  cerrarHasta: number | null
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
