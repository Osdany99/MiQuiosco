/**
 * Léxico base de comandos (Fase A).
 * Incluye el vocabulario de venta, navegación y consulta (P3).
 */
export const LEXICO_VERSION_SCHEMA = 1

export const LEXICO_BASE = Object.freeze({
  ventaFuerte: [
    'vende', 'vendeme', 'vendemelo', 'vendes', 'vendan', 'vender', 'vendo',
    'vendio', 'vendieron', 'vendimos', 'vendiste', 'anota', 'anotame',
    'anotamelo', 'registra', 'registrame', 'saca', 'sacame', 'despacha',
    'despachame', 'vendele', 'cobra', 'cobrame', 'cobrale', 'apunta', 'apuntame'
  ],
  ventaDebil: ['dame', 'damelo', 'ponme', 'ponmelo', 'pon'],
  navegacionVerbo: ['abre', 'abrir', 'abreme', 'muestra', 'muestrame', 'ir', 've', 'vamos', 'llevame', 'entra', 'entrar', 'ensename'],
  navegacionComplemento: ['hoy', 'dia', 'ayer', 'actual'],
  consultaMarca: ['cuanto', 'cuanta', 'cuantos', 'cuantas', 'hay', 'queda', 'quedan', 'stock', 'existencia', 'existencias', 'tenemos', 'tengo', 'disponible', 'disponibles', 'inventario'],
  destinos: {
    cuadre: ['cuadre'], cuadres: ['cuadres'],
    productos: ['productos', 'producto', 'catalogo'],
    clientes: ['clientes', 'cliente'],
    deudas: ['deudas', 'deuda', 'fiados', 'fiado'],
    recargas: ['recargas', 'recarga'],
    graficas: ['graficas', 'grafica', 'estadisticas'],
    quiosco: ['quiosco', 'kiosco'], almacen: ['almacen', 'inventario'],
    usuarios: ['usuarios'], proveedores: ['proveedores']
  }
})

export function crearLexico(base) {
  return base
}
