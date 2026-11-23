import { CLIENTE_SIN_CLIENTE_NOMBRE } from '../../shared/constants.ts'

/** Tablas necesarias para fiado directo, deuda de dinero y transferencia. */
export const TABLAS_PUSH_TRABAJADOR = Object.freeze([
  'clientes',
  'cuadres',
  'cuentas_fiado',
  'cuentas_fiado_items',
  'movimientos_inventario',
  'transferencias'
])

/**
 * El servidor repite la autorización y valida cada fila. Aquí solo se evita
 * enviar pendientes de otros usuarios/tareas guardados en el mismo dispositivo.
 * Se mantiene todo el contexto en UNA petición para validar cuentas + items +
 * movimientos + cuadre como una operación coherente.
 */
export function filtrarPendientesTrabajador(pendientes = {}) {
  const filtrado = { deletes: [] }
  for (const tabla of TABLAS_PUSH_TRABAJADOR) {
    if (!Array.isArray(pendientes?.[tabla]) || !pendientes[tabla].length) continue
    const filas = tabla === 'clientes'
      ? pendientes[tabla].filter(c => c?.esCentinela === true && c?.nombre === CLIENTE_SIN_CLIENTE_NOMBRE && c?.activo !== false)
      : pendientes[tabla]
    if (filas.length) filtrado[tabla] = filas
  }
  return filtrado
}
