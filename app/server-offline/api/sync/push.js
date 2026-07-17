/**
 * server-offline/sync/push.js
 *
 * Prepara el payload de push: reúne todos los registros con sincronizado = 0
 * de cada tabla sincronizable, listos para enviar al servidor.
 */
const SYNC_TABLAS = [
  { tabla: 'productos', puestoScoped: true },
  { tabla: 'usuarios', puestoScoped: true },
  { tabla: 'cuadres', puestoScoped: true },
  { tabla: 'cuadre_items' },
  { tabla: 'cuentas_fiado', puestoScoped: true },
  { tabla: 'cuentas_fiado_items' },
  { tabla: 'pagos_fiado' },
  { tabla: 'historial_precios' }
]

export async function push(opts, auth) {
  void opts
  void auth
  const result = {}
  for (const cfg of SYNC_TABLAS) {
    const repo = useLocalRepo(cfg)
    const todos = await repo.readAll()
    result[cfg.tabla] = todos
      .filter(r => !r.sincronizado)
      .map((row) => {
        const { sincronizado, ...rest } = row
        void sincronizado
        return rest
      })
  }
  return result
}
