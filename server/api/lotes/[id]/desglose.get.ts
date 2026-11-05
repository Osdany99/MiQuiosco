import { and, eq, inArray, isNull } from 'drizzle-orm'
import { db } from '../../../database/client'
import {
  lotes,
  productos,
  proveedores,
  movimientosInventario,
  cuadreItems,
  cuadres,
  ventasDirectas,
  ventasDirectasItems,
  cuentasFiado,
  cuentasFiadoItems,
  clientes,
  usuarios
} from '../../../database/schema'
import { requireRole } from '../../../utils/auth'
import { desgloseDeLote } from '#shared/inventario/desglose'

/**
 * Desglose completo de un lote para el diálogo de detalle.
 *
 * Todo se calcula en shared/inventario/desglose.js, la misma función que usa
 * el modo offline. Aquí solo se leen las filas relacionadas: los movimientos
 * del producto (para poder reconstruir el costo FIFO de cada línea del cuadre)
 * y las cabeceras/líneas que esos movimientos referencian.
 */
export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const id = event.context.params?.id
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Lote inválido.' })

  const puestoId = auth.usuario.puestoId

  const [lote] = await db
    .select()
    .from(lotes)
    .where(and(eq(lotes.id, id), eq(lotes.puestoId, puestoId)))
    .limit(1)
  if (!lote) throw createError({ statusCode: 404, statusMessage: 'Lote no encontrado.' })

  // Los movimientos del producto bastan: una línea de cuadre o de venta directa
  // solo consume lotes del mismo producto, y así se puede reconstruir su costo
  // FIFO completo aunque esta fila sea de un lote concreto.
  const movs = await db
    .select()
    .from(movimientosInventario)
    .where(
      and(
        eq(movimientosInventario.puestoId, puestoId),
        eq(movimientosInventario.productoId, lote.productoId)
      )
    )

  const cuadreIds = [...new Set(movs.map(m => m.cuadreId).filter(Boolean))] as string[]
  const ventaIds = [...new Set(movs.map(m => m.ventaDirectaId).filter(Boolean))] as string[]

  const [lineas, cuadresRows, ventasRows, ventaItemsRows, producto, proveedor] = await Promise.all([
    cuadreIds.length
      ? db.select().from(cuadreItems).where(inArray(cuadreItems.cuadreId, cuadreIds))
      : Promise.resolve([]),
    cuadreIds.length
      ? db.select().from(cuadres).where(inArray(cuadres.id, cuadreIds))
      : Promise.resolve([]),
    ventaIds.length
      ? db.select().from(ventasDirectas).where(inArray(ventasDirectas.id, ventaIds))
      : Promise.resolve([]),
    ventaIds.length
      ? db.select().from(ventasDirectasItems).where(inArray(ventasDirectasItems.ventaDirectaId, ventaIds))
      : Promise.resolve([]),
    db.select().from(productos).where(eq(productos.id, lote.productoId)).limit(1).then(r => r[0] ?? null),
    lote.proveedorId
      ? db.select().from(proveedores).where(eq(proveedores.id, lote.proveedorId)).limit(1).then(r => r[0] ?? null)
      : Promise.resolve(null)
  ])

  // Cuentas fiado: las de los cuadres tocados (para resolver el cliente de una
  // línea fiada) y todas las directas del puesto (pestaña Fiado y fallback de
  // deudas anteriores al enlace directo).
  const [cuentasCuadre, cuentasDirectas] = await Promise.all([
    cuadreIds.length
      ? db.select().from(cuentasFiado).where(inArray(cuentasFiado.cuadreOrigenId, cuadreIds))
      : Promise.resolve([]),
    db.select().from(cuentasFiado).where(
      and(eq(cuentasFiado.puestoId, puestoId), isNull(cuentasFiado.cuadreOrigenId))
    )
  ])
  const cuentas = [...cuentasCuadre, ...cuentasDirectas]
  const cuentaIds = [...new Set(cuentas.map(c => c.id))]
  const cuentaItems = cuentaIds.length
    ? await db.select().from(cuentasFiadoItems).where(inArray(cuentasFiadoItems.cuentaFiadoId, cuentaIds))
    : []

  const [clientesRows, usuariosRows] = await Promise.all([
    db.select().from(clientes).where(eq(clientes.puestoId, puestoId)),
    db.select().from(usuarios).where(eq(usuarios.puestoId, puestoId))
  ])

  return desgloseDeLote({
    lote: {
      ...lote,
      nombreProducto: producto?.nombre ?? null,
      proveedorNombre: proveedor?.nombre ?? null
    },
    movimientos: movs,
    cuadreItems: lineas,
    cuadres: cuadresRows,
    ventas: ventasRows,
    ventaItems: ventaItemsRows,
    cuentas,
    cuentaItems,
    clientes: clientesRows,
    usuarios: usuariosRows
  })
})
