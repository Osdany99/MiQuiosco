/* eslint-disable @typescript-eslint/no-explicit-any */

export async function createProductoMut(ctx: any, data: any, auth: any) {
  const p = await ctx.insert('productos', data)
  await ctx.insert('historial_precios', {
    productoId: p.id,
    precioCompra: Number(data.precioCompraActual ?? 0),
    precioVenta: Number(data.precioVentaActual ?? 0),
    vigenteDesde: p.creadoEn,
    vigenteHasta: null,
    cambiadoPor: auth?.usuarioActual?.value?.id
  })
  return p
}

export async function updateProductoMut(ctx: any, id: string, cambios: any, auth: any) {
  const previo = await ctx.get('productos', id)
  const cambioCompra = cambios.precioCompraActual != null
    && Number(cambios.precioCompraActual) !== Number(previo?.precioCompraActual)
  const cambioVenta = cambios.precioVentaActual != null
    && Number(cambios.precioVentaActual) !== Number(previo?.precioVentaActual)

  await ctx.update('productos', id, cambios)

  if (cambioCompra || cambioVenta) {
    const ahora = Date.now()
    const historiales = await ctx.queryAll('historial_precios')
    const vigente = historiales.find((h: any) => h.productoId === id && !h.vigenteHasta)

    let vigenteDesde = ahora
    if (vigente) {
      const vDesde = Number(vigente.vigenteDesde)
      vigenteDesde = Math.max(ahora, vDesde + 1)
      await ctx.update('historial_precios', vigente.id, {
        vigenteHasta: Math.max(vigenteDesde - 1, vDesde)
      })
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
