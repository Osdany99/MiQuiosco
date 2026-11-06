/**
 * GET /api/admin/puestos
 *
 * Lista de puestos con sus contadores y sus jefes. Es la pantalla principal del
 * panel: crear un puesto (con su jefe), activarlo/desactivarlo y ver el estado
 * de sync de cada local.
 */
export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  return { puestos: await listarPuestosAdmin() }
})
