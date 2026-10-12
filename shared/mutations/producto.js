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

import { aEpoch } from '../fechas.js'

/**
 * Crea el producto.
 *
 * SIN fila de historial inicial. El historial de precios es de VENTA: lo que el
 * jefe captura al crear el producto es su precio de venta, y esa fila ya nace en
 * la primera edición o entrada. Meterla aquí obligaba a inventar un precio de
 * compra (0, porque el formulario no lo pide) y esa fila era basura: salía en el
 * historial como si fuera un precio real.
 */
export async function createProductoMut(ctx, data) {
  return ctx.insert('productos', data)
}

/**
 * Rango temporal de la nueva fila vigente del historial.
 *
 * "Una sola fila vigente por producto": se cierran TODAS las abiertas, no solo
 * la primera, porque si un dispositivo arrastró duplicados cerrarlos todos es lo
 * único que deja el historial sano. La nueva arranca después de la última.
 *
 * aEpoch y no Number() a pelo: `vigenteDesde` puede venir como ISO del servidor
 * (columna integer en SQLite) y Number(iso) es NaN, que se propagaría por
 * Math.max y el INSERT se iría con NOT NULL constraint failed.
 */
function rangoVigente(abiertos, ahora) {
  const lista = Array.isArray(abiertos) ? abiertos : []
  let vigenteDesde = aEpoch(ahora)
  for (const abierta of lista) {
    vigenteDesde = Math.max(vigenteDesde, aEpoch(abierta.vigenteDesde) + 1)
  }
  const cierres = lista.map(abierta => ({
    id: abierta.id,
    hasta: Math.max(vigenteDesde - 1, aEpoch(abierta.vigenteDesde))
  }))
  return { vigenteDesde, cierres }
}

/**
 * Aplica la edición del producto y, si cambió el precio de VENTA, rota su
 * historial.
 *
 * El precio de compra no se guarda en ningún sitio: vive en el lote
 * (`lotes.precioUnitario`), que es su único origen y ya tiene su propio
 * historial. Aquí se borra del parche para que el formulario no lo invente.
 */
export async function updateProductoMut(ctx, id, cambios, auth) {
  delete cambios.precioCompraActual
  const previo = await ctx.get('productos', id)
  const cambioVenta = cambios.precioVentaActual != null
    && Number(cambios.precioVentaActual) !== Number(previo?.precioVentaActual)

  await ctx.update('productos', id, cambios)

  if (cambioVenta) {
    const ahora = Date.now()
    const abiertos = ctx.findHistorialAbiertos
      ? await ctx.findHistorialAbiertos(id)
      : (await ctx.queryAll('historial_precios'))
          .filter(h => h.productoId === id && h.vigenteHasta == null)

    const { vigenteDesde, cierres } = rangoVigente(abiertos, ahora)
    for (const cierre of cierres) {
      await ctx.update('historial_precios', cierre.id, { vigenteHasta: cierre.hasta })
    }

    await ctx.insert('historial_precios', {
      productoId: id,
      // Sin precio de compra: la columna sigue existiendo en la base por no
      // migrar, pero ya nadie la lee ni la escribe con un valor real.
      precioCompra: Number(previo?.precioCompraActual ?? 0),
      precioVenta: Number(cambios.precioVentaActual ?? previo?.precioVentaActual ?? 0),
      vigenteDesde,
      vigenteHasta: null,
      cambiadoPor: auth?.usuarioActual?.value?.id
    })
  }
  return ctx.get('productos', id)
}
