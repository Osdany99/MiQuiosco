/**
 * Lógica de tope de fiado (compartida cliente/servidor).
 *
 * Regla de negocio: la cantidad fiada de un producto en un cuadre no puede
 * exceder la cantidad vendida de ese producto en el mismo cuadre. "Vendida"
 * son las unidades registradas en la línea del producto (cuadre_items);
 * "ya fiada" son las unidades de todas las cuentas del cuadre.
 */

/**
 * Suma cantidades por producto a partir de una lista de registros/items.
 * @param {Array<{productoId: string, cantidad: number}>} items
 * @returns {Map<string, number>}
 */
export function sumarPorProducto(items) {
  const mapa = new Map()
  for (const it of items) {
    if (!it?.productoId) continue
    const actual = mapa.get(it.productoId) ?? 0
    mapa.set(it.productoId, actual + (Number(it.cantidad) || 0))
  }
  return mapa
}

/**
 * Devuelve el primer exceso del tope (o null si todo cabe).
 *
 * @param {Map<string, number>} vendidosPorProducto cantidad vendida por producto del cuadre
 * @param {Map<string, number>} fiadosPorProducto cantidad ya fiada por producto del cuadre
 * @param {Array<{productoId: string, cantidad: number}>} itemsNuevos items que se intentan registrar
 * @returns {{ productoId: string, disponible: number, pedido: number } | null}
 */
export function calcularExcesoTope(vendidosPorProducto, fiadosPorProducto, itemsNuevos) {
  const pedido = sumarPorProducto(itemsNuevos)
  for (const [productoId, cantidad] of pedido) {
    const vendido = Number(vendidosPorProducto.get(productoId) ?? 0)
    const yaFiado = Number(fiadosPorProducto.get(productoId) ?? 0)
    const disponible = vendido - yaFiado
    if (cantidad > disponible) {
      return { productoId, disponible, pedido: cantidad }
    }
  }
  return null
}
