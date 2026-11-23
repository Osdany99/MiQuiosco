import { Preferences } from '@capacitor/preferences'

const PREFIJO = 'voz.operacion.v1.'

/**
 * Planes de voz en almacenamiento durable del dispositivo. Una clave por plan:
 * actualizar un cobro no sobrescribe otro que esté ejecutándose en paralelo.
 * No contiene texto dictado ni nombres; solo IDs, importes y payloads de dominio.
 */
export function crearAlmacenOperacionesVoz(adapter = Preferences) {
  const clave = id => `${PREFIJO}${id}`

  async function guardar(plan) {
    if (!plan?.id) throw new Error('No se puede guardar una operación sin commandId.')
    await adapter.set({ key: clave(plan.id), value: JSON.stringify(plan) })
    return plan
  }

  async function eliminar(id) {
    await adapter.remove({ key: clave(id) })
  }

  async function listar() {
    const { keys = [] } = await adapter.keys()
    const planes = []
    for (const key of keys.filter(k => k.startsWith(PREFIJO)).sort()) {
      const { value } = await adapter.get({ key })
      if (!value) continue
      let plan
      try {
        plan = JSON.parse(value)
      } catch (error) {
        throw new Error('Hay un seguimiento de voz dañado. Revisa la operación antes de repetirla.', { cause: error })
      }
      if (plan?.id && Array.isArray(plan.pasos)) planes.push(plan)
    }
    return planes
  }

  /** Recupera el mismo comando confirmado, nunca otro usuario/puesto. */
  async function buscarCoincidente({ tipo, puestoId, usuarioId, recuperacion }) {
    const planes = await listar()
    return planes
      .filter(plan => plan.tipo === tipo
        && plan.puestoId === puestoId
        && plan.usuarioId === usuarioId
        && plan.recuperacion === recuperacion)
      .sort((a, b) => (Number(a.creadoEn) || 0) - (Number(b.creadoEn) || 0))[0] ?? null
  }

  /** Impide cambiar un dato para saltarse una operación aún sin reconciliar. */
  async function buscarPendienteDeCliente({ tipo, puestoId, usuarioId, clienteId }) {
    if (!clienteId) return null
    const planes = await listar()
    return planes.find(plan => plan.tipo === tipo
      && plan.puestoId === puestoId
      && plan.usuarioId === usuarioId
      && plan.clienteId === clienteId
      && plan.pasos.some(paso => paso.estado !== 'aplicado')) ?? null
  }

  return { guardar, eliminar, listar, buscarCoincidente, buscarPendienteDeCliente }
}
