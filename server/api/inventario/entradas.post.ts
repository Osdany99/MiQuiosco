import { eq, and, isNull, inArray, asc } from 'drizzle-orm'
import { db } from '../../database/client'
import { lotes, movimientosInventario, productos, historialPrecios, proveedores } from '../../database/schema'
import { entradaAlmacenSchema } from '#shared/schemas/entradaAlmacen'
import { construirEntrada, rotarPrecioCompra } from '#shared/inventario/operaciones'
import { comoMovimiento, comoRotacionPrecio } from '../../utils/inventario'

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
    ahora: ahoraMs
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

    // Rotación del precio de compra por producto (solo cambia si difiere).
    for (const linea of datos.lineas) {
      const producto = porId.get(linea.productoId)!
      // Todas las filas sin cerrar, no solo una: si el producto arrastra
      // duplicados, cerrar solo el primero deja el resto vigente para siempre.
      const abiertos = await tx
        .select()
        .from(historialPrecios)
        .where(and(eq(historialPrecios.productoId, linea.productoId), isNull(historialPrecios.vigenteHasta)))
        .orderBy(asc(historialPrecios.vigenteDesde))
      const rot = comoRotacionPrecio(
        rotarPrecioCompra({
          producto,
          abiertos,
          nuevoPrecio: linea.precioUnitario,
          ahora: ahoraMs,
          usuarioId
        })
      )
      if (!rot) continue
      for (const cierre of rot.cierres) {
        await tx
          .update(historialPrecios)
          .set({ vigenteHasta: new Date(cierre.hasta) })
          .where(eq(historialPrecios.id, cierre.id))
      }
      await tx.insert(historialPrecios).values({
        productoId: linea.productoId,
        precioCompra: rot.nuevoHistorial.precioCompra,
        precioVenta: rot.nuevoHistorial.precioVenta,
        vigenteDesde: new Date(rot.nuevoHistorial.vigenteDesde),
        cambiadoPor: usuarioId
      })
      await tx
        .update(productos)
        .set({ precioCompraActual: rot.espejo })
        .where(eq(productos.id, linea.productoId))
    }
  })

  return { entradaRef, lotes: lotesNuevos.length, movimientos: movimientos.length }
})
