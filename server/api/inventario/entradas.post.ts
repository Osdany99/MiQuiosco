import { eq, and, inArray } from 'drizzle-orm'
import { db } from '../../database/client'
import { lotes, movimientosInventario, productos, proveedores } from '../../database/schema'
import { entradaAlmacenSchema } from '#shared/schemas/entradaAlmacen'
import { construirEntrada } from '#shared/inventario/operaciones'
import { comoMovimiento } from '../../utils/inventario'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const body = await readBody(event)
  const parsed = entradaAlmacenSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Datos inválidos.', data: parsed.error.flatten() })
  }
  const datos = parsed.data
  const puestoId = auth.usuario.puestoId
  const usuarioId = auth.usuario.id
  const ahora = new Date()
  const ahoraMs = ahora.getTime()

  // Reintento de la misma entrada: `entradaRef` la identifica. Los lotes ya
  // creados se devuelven contados y no se vuelve a dar stock.
  if (datos.entradaRef) {
    const previos = await db
      .select({ id: lotes.id })
      .from(lotes)
      .where(and(eq(lotes.puestoId, puestoId), eq(lotes.entradaRef, datos.entradaRef)))
    if (previos.length > 0) {
      const ids = previos.map(l => l.id)
      const movs = await db
        .select({ id: movimientosInventario.id })
        .from(movimientosInventario)
        .where(inArray(movimientosInventario.loteId, ids))
      return {
        entradaRef: datos.entradaRef,
        lotes: previos.length,
        movimientos: movs.length,
        idempotente: true
      }
    }
  }

  // Validar productos del puesto.
  const ids = [...new Set(datos.lineas.map(l => l.productoId))]
  const prods = await db.select().from(productos).where(inArray(productos.id, ids))
  const porId = new Map(prods.map(p => [p.id, p]))
  for (const id of ids) {
    const p = porId.get(id)
    if (!p || p.puestoId !== puestoId) {
      throw createError({ statusCode: 400, statusMessage: 'Hay productos que no pertenecen a este puesto.' })
    }
  }

  // Validar proveedor del puesto (opcional).
  if (datos.proveedorId) {
    const [prov] = await db.select().from(proveedores).where(eq(proveedores.id, datos.proveedorId)).limit(1)
    if (!prov || prov.puestoId !== puestoId) {
      throw createError({ statusCode: 400, statusMessage: 'Proveedor inválido.' })
    }
  }

  const { entradaRef, lotes: lotesNuevos, movimientos } = construirEntrada(datos, {
    puestoId,
    usuarioId,
    ahora: ahoraMs,
    entradaRef: datos.entradaRef
  })

  await db.transaction(async (tx) => {
    for (const l of lotesNuevos) {
      await tx.insert(lotes).values({
        id: l.id,
        puestoId: l.puestoId,
        productoId: l.productoId,
        proveedorId: l.proveedorId,
        lugarCompra: l.lugarCompra,
        fechaEntrada: l.fechaEntrada,
        cantidadInicial: l.cantidadInicial,
        precioUnitario: l.precioUnitario,
        detalleCompra: l.detalleCompra,
        entradaRef: l.entradaRef,
        anulado: false,
        notas: l.notas,
        creadoPor: l.creadoPor
      })
    }
    for (const m of movimientos) {
      await tx.insert(movimientosInventario).values(comoMovimiento(m))
    }
  })

  return { entradaRef, lotes: lotesNuevos.length, movimientos: movimientos.length }
})
