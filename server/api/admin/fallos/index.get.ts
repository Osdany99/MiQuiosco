/**
 * GET /api/admin/fallos
 *
 * Fallos de sincronización con filtros: `puestoId`, `dispositivoId`, `tipo`,
 * `tabla`, `estado` (abierto|resuelto), `limit` y `offset`.
 *
 * Los fallos llegan del buzón de cada APK y se deduplican por puesto: un mismo
 * error repetido suma `intentos` en vez de crear filas nuevas.
 */
export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const query = getQuery(event)
  const estado = textoQuery(query.estado)

  return await listarFallosAdmin({
    puestoId: textoQuery(query.puestoId),
    dispositivoId: textoQuery(query.dispositivoId),
    tipo: textoQuery(query.tipo),
    motivo: textoQuery(query.motivo),
    tabla: textoQuery(query.tabla),
    estado: estado === 'abierto' || estado === 'resuelto' ? estado : undefined,
    limit: numeroQuery(query.limit, 200),
    offset: numeroQuery(query.offset)
  })
})
