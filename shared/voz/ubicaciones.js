/**
 * shared/voz/ubicaciones.js — cómo llama la gente al almacén y al quiosco (puro).
 *
 * El intérprete reconoce el destino de un traspaso con este mapa. Sin él,
 * «pasa 10 azúcar al kiosco» no se veía como traspaso y se grababa como venta:
 * el stock salía del almacén como vendido y se creaba un cliente «kiosco».
 *
 * El servicio nativo (app cerrada) lleva su propia copia en `dialogo.json`;
 * un test comprueba que las dos no se separen.
 *
 * Sin Vue y sin datos: se prueba con `node --test`.
 */

/** Sinónimo normalizado → ubicación canónica. */
export const UBICACIONES = Object.freeze({
  almacen: 'almacen',
  deposito: 'almacen',
  quiosco: 'quiosco',
  kiosco: 'quiosco'
})

/** Nombres aceptados, para construir las expresiones regulares del intérprete. */
export const NOMBRES_UBICACION = Object.freeze(Object.keys(UBICACIONES))

function sinTildes(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * «deposito» → «almacen», «kiosco» → «quiosco».
 * Devuelve `null` si la palabra no es una ubicación.
 */
export function ubicacionDePalabra(palabra) {
  return UBICACIONES[sinTildes(palabra)] ?? null
}
