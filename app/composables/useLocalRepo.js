/**
 * useLocalRepo(tabla) — Capa de repositorio local sobre useLocalDb.
 *
 * Cada escritura genera id, timestamps y marca sincronizado = 0
 * para que el sync eventual los recoja.
 *
 * @param {string} tabla — nombre de la tabla (snake_case)
 * @returns {Object} { create, read, readAll, update, patch, remove }
 */
export function useLocalRepo(tabla) {
  const localDb = useLocalDb()

  const ahora = () => Date.now()

  /**
   * Crea un registro. Si datos ya trae id/timestamps/sincronizado
   * los respeta; si no, los genera automáticamente.
   */
  async function create(datos) {
    const ahoraMs = ahora()
    const registro = {
      id: crypto.randomUUID(),
      ...datos,
      creado_en: datos.creado_en ?? ahoraMs,
      actualizado_en: datos.actualizado_en ?? ahoraMs,
      sincronizado: datos.sincronizado ?? 0
    }
    await localDb.insert(tabla, registro)
    return registro
  }

  /**
   * Lee un registro por id.
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  async function read(id) {
    return localDb.getById(tabla, id)
  }

  /**
   * Lee todos los registros, opcionalmente ordenados.
   * @param {Object} opts — { orderBy, orderDir }
   * @returns {Promise<Object[]>}
   */
  async function readAll(opts) {
    const rows = await localDb.queryAll(tabla)
    if (opts?.orderBy) {
      const dir = opts.orderDir === 'desc' ? -1 : 1
      rows.sort((a, b) => {
        const va = a[opts.orderBy] ?? ''
        const vb = b[opts.orderBy] ?? ''
        return typeof va === 'string'
          ? va.localeCompare(vb) * dir
          : (va - vb) * dir
      })
    }
    return rows
  }

  /**
   * Actualiza un registro (solo cambia los campos provistos).
   * @param {string} id
   * @param {Object} cambios — campos a modificar
   */
  async function update(id, cambios) {
    await localDb.update(tabla, id, {
      ...cambios,
      actualizado_en: ahora()
    })
  }

  /**
   * Alias de update. Misma firma.
   */
  async function patch(id, cambios) {
    return update(id, cambios)
  }

  /**
   * Elimina un registro.
   * @param {string} id
   */
  async function remove(id) {
    await localDb.remove(tabla, id)
  }

  return { create, read, readAll, update, patch, remove }
}
