/**
 * server-offline/utils/inyectarPuestoId.js
 *
 * Helper compartido por las operaciones create.js de las 5 tablas
 * que tienen puestoId NOT NULL (usuarios, productos, cuadres, clientes, cuentas_fiado).
 *
 * Centraliza la regla "si no me pasan puestoId, tomar el del usuario actual"
 * para que cualquier cambio futuro (multi-puesto, sin puesto, etc.) se haga en un solo lugar.
 */

/**
 * Inyecta el puestoId del usuario actual si el payload no lo trae.
 * @param {object} datos — payload original (camelCase)
 * @param {{ usuarioActual: { value: { puestoId?: string } } }} auth
 * @returns {object} nuevo objeto con puestoId garantizado
 */
export function inyectarPuestoId(datos, auth) {
  if (datos?.puestoId) return { ...datos }
  const puestoId = auth?.usuarioActual?.value?.puestoId
  if (!puestoId) {
    throw new Error('No se puede crear el registro: falta puestoId y el usuario actual no tiene uno asignado.')
  }
  return { ...datos, puestoId }
}
