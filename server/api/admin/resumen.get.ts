/**
 * GET /api/admin/resumen
 *
 * Contadores para el tablero: puestos, dispositivos conectados y fallos
 * abiertos. Las listas detalladas viven en sus propios endpoints.
 */
export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  return await resumenAdmin()
})
