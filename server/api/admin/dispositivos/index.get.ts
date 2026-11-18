/**
 * GET /api/admin/dispositivos
 *
 * Equipos (APKs) que sincronizan, con su puesto y los últimos usuarios que
 * entraron en cada uno. Filtros: `puestoId`, `revocado` (true|false), `q`
 * (nombre/modelo) y paginación.
 */
export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const query = getQuery(event)

  return await listarDispositivosAdmin({
    puestoId: textoQuery(query.puestoId),
    revocado: booleanoQuery(query.revocado),
    q: textoQuery(query.q),
    limit: numeroQuery(query.limit, 300),
    offset: numeroQuery(query.offset)
  })
})
