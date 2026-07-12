/**
 * api-offline/usuarios/create.js
 *
 * Crea un usuario local con PIN hasheado y puestoId inyectado.
 * Espejo de server/api/usuarios/index.post.ts + useUsuarioRepo.js (lógica de hash).
 */
import { useDb } from '../../db-offline/client'
import { hashPin, requireJefe } from '../../utils-offline/auth'
import { inyectarPuestoId } from '../../utils-offline/inyectarPuestoId'

/**
 * @param {object} datos — { nombre, rol, pin, activo?, salario? }
 * @param {object} auth
 * @returns {Promise<object>}
 */
export async function create(datos, auth) {
  requireJefe(auth)
  const payload = inyectarPuestoId(datos, auth)
  const pinHash = await hashPin(payload.pin)
  const ahora = Date.now()
  const id = crypto.randomUUID()

  const db = useDb()
  const registro = {
    id,
    puestoId: payload.puestoId,
    nombre: payload.nombre,
    rol: payload.rol,
    pinHash,
    activo: payload.activo ?? true,
    salario: payload.salario ?? 600,
    creadoEn: ahora,
    actualizadoEn: ahora,
    sincronizado: 0
  }
  await db.insert('usuarios', registro)
  return {
    id: registro.id,
    nombre: registro.nombre,
    rol: registro.rol,
    activo: registro.activo,
    salario: Number(registro.salario),
    puestoId: registro.puestoId,
    creadoEn: registro.creadoEn,
    actualizadoEn: registro.actualizadoEn
  }
}
