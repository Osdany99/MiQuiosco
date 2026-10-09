/* eslint-disable @typescript-eslint/no-explicit-any */
import { calcularRotacionHistorial } from '../inventario/operaciones.js'
import { aEpoch } from '../fechas.js'

export async function createProductoMut(ctx: any, data: any, auth: any) {
  const p = await ctx.insert('productos', data)
  await ctx.insert('historial_precios', {
    productoId: p.id,
    precioCompra: Number(data.precioCompraActual ?? 0),
    precioVenta: Number(data.precioVentaActual ?? 0),
    // aEpoch y no Number(): el creadoEn puede venir como ISO del servidor y
    // Number(iso) es NaN → INSERT con vigente_desde NULL → error 1299.
    vigenteDesde: aEpoch(p.creadoEn) || Date.now(),
    vigenteHasta: null,
    cambiadoPor: auth?.usuarioActual?.value?.id
  })
  return p
}

export async function updateProductoMut(ctx: any, id: string, cambios: any, auth: any) {
  // El precio de compra lo gobiernan los lotes (entradas al almacén): aquí se
  // ignora para no desincronizar el espejo. La corrección vive en el lote.
  delete cambios.precioCompraActual
  const previo = await ctx.get('productos', id)
  const cambioCompra = cambios.precioCompraActual != null
    && Number(cambios.precioCompraActual) !== Number(previo?.precioCompraActual)
  const cambioVenta = cambios.precioVentaActual != null
    && Number(cambios.precioVentaActual) !== Number(previo?.precioVentaActual)

  await ctx.update('productos', id, cambios)

  if (cambioCompra || cambioVenta) {
    const ahora = Date.now()
    // Todas las abiertas, no solo la primera: cerrar una y dejar el resto
    // abierta produce productos con varias filas vigentes, que es como se
    // corrompió el historial. Con varias, calcularRotacionHistorial coloca la
    // nueva fila después de la última y cierra todas.
    const abiertos = ctx.findHistorialAbiertos
      ? await ctx.findHistorialAbiertos(id)
      : (await ctx.queryAll('historial_precios'))
          .filter((h: any) => h.productoId === id && h.vigenteHasta == null)

    const { vigenteDesde, cierres } = calcularRotacionHistorial({ abiertos, ahora })
    for (const cierre of cierres) {
      await ctx.update('historial_precios', cierre.id, { vigenteHasta: cierre.hasta })
    }

    await ctx.insert('historial_precios', {
      productoId: id,
      precioCompra: Number(cambios.precioCompraActual ?? previo?.precioCompraActual ?? 0),
      precioVenta: Number(cambios.precioVentaActual ?? previo?.precioVentaActual ?? 0),
      vigenteDesde,
      vigenteHasta: null,
      cambiadoPor: auth?.usuarioActual?.value?.id
    })
  }
  return ctx.get('productos', id)
}
