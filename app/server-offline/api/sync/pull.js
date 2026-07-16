/**
 * server-offline/sync/pull.js
 *
 * Aplica un resultado de pull (proveniente del server) a la DB local.
 */
const SYNC_TABLAS = [
  { tabla: 'productos', puestoScoped: true },
  { tabla: 'usuarios', puestoScoped: true },
  { tabla: 'clientes', puestoScoped: true },
  { tabla: 'cuadres', puestoScoped: true },
  { tabla: 'cuadre_items' },
  { tabla: 'cuentas_fiado', puestoScoped: true },
  { tabla: 'cuentas_fiado_items' },
  { tabla: 'pagos_fiado' },
  { tabla: 'historial_precios' }
]

export async function pull(pullResult, _opts, _auth) {
  void _opts
  void _auth
  let aplicados = 0
  for (const cfg of SYNC_TABLAS) {
    const registros = pullResult[cfg.tabla]
    if (!registros?.length) continue
    const repo = useLocalRepo(cfg)
    for (const reg of registros) {
      const existing = await repo.read(reg.id)
      if (existing) {
        await repo.update(reg.id, { ...reg, sincronizado: 1 })
      } else {
        await repo.create({ ...reg, sincronizado: 1 })
      }
      aplicados++
    }
  }
  return { aplicados }
}
