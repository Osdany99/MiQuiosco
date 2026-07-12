/**
 * api-offline/cuadres/create.js
 *
 * Crea un cuadre con puestoId inyectado. El jefeId se toma del auth.
 * Espejo de server/api/cuadres/index.post.ts.
 */
import { useDb } from '../../db-offline/client'
import { inyectarPuestoId } from '../../utils-offline/inyectarPuestoId'

/**
 * @param {object} datos — { fecha, trabajadorTurnoId?, ... }
 * @param {object} auth — { usuarioActual: { value: { id, puestoId, ... } } }
 * @returns {Promise<object>}
 */
export async function create(datos, auth) {
  const payload = inyectarPuestoId(datos, auth)
  const ahora = Date.now()
  const id = crypto.randomUUID()
  const db = useDb()
  const registro = {
    id,
    puestoId: payload.puestoId,
    fecha: payload.fecha,
    jefeId: auth?.usuarioActual?.value?.id,
    trabajadorTurnoId: payload.trabajadorTurnoId ?? null,
    pagoTrabajador: payload.pagoTrabajador ?? null,
    totalEsperado: payload.totalEsperado ?? 0,
    totalRealCaja: payload.totalRealCaja ?? null,
    montoTransferencia: payload.montoTransferencia ?? 0,
    montoFiado: payload.montoFiado ?? 0,
    montoCobradoFiado: payload.montoCobradoFiado ?? null,
    diferencia: payload.diferencia ?? null,
    estado: 'abierto',
    notas: payload.notas ?? null,
    cerradoEn: null,
    reabiertoVeces: 0,
    ultimaReaperturaEn: null,
    creadoEn: ahora,
    actualizadoEn: ahora,
    sincronizado: 0
  }
  await db.insert('cuadres', registro)
  return registro
}
