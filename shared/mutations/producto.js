/**
 * shared/mutations/producto.js — Reglas de negocio de productos, en JS a
 * propósito.
 *
 * POR QUÉ NO ES .ts
 * Lo importan el cliente (`app/server-offline/index.js`), los endpoints
 * (`#shared/mutations/producto`) y los tests de node. En dev, Nitro solo puede
 * dejar un módulo de `shared/` como import externo si es .js; un .ts lo
 * inlinea en el bundle y sus imports relativos salen rebasados contra la raíz
 * del disco (`../../../../../shared/fechas.js`), así que TODO /api/* devolvía
 * 500 con "Cannot find module". Con .js se comporta como el resto de `shared/`
 * (schemas, tables, inventario) y todo eso deja de importar.
 *
 * Sin anotaciones de tipo a propósito: `ctx` es la interfaz de la capa de
 * datos (offline u pg según quién llame) y sus params no tienen un tipo único.
 */

import { calcularRotacionHistorial } from '../inventario/operaciones.js'
import { aEpoch } from '../fechas.js'

/**
 * Crea el producto y su primera fila de historial (el rango vigente inicial
 * arranca en el creado del producto).
 */
export async function createProductoMut(ctx, data, auth) {
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

/**
 * Aplica la edición del producto y, si cambió un precio, rota su historial.
 */
export async function updateProductoMut(ctx, id, cambios, auth) {
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
          .filter(h => h.productoId === id && h.vigenteHasta == null)

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
