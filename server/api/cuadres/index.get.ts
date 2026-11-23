import { and, eq, type Column } from 'drizzle-orm'
import { crudList } from '../../utils/crud'
import { requirePermiso } from '../../utils/permisos'

export default defineEventHandler(async (event) => {
  const auth = await requirePermiso(event, {
    jefe: null,
    trabajador: ['acciones.cuadre.fiar', 'acciones.cuadre.transferencia']
  })
  const query = getQuery(event)

  const trabajador = auth.usuario.rol === 'trabajador'
  const filas = await crudList({ tabla: 'cuadres', puestoScoped: true }, {
    query,
    auth,
    listFilter: ({ query: q, columns }) => and(
      trabajador ? eq(columns.estado as Column, 'abierto') : undefined,
      q.fecha ? eq(columns.fecha as Column, String(q.fecha)) : undefined
    )
  })

  // El trabajador solo necesita identificar el cuadre abierto y sus acumulados
  // operativos; nunca recibe costos, ganancias, salarios ni efectivo contado.
  if (trabajador) {
    return filas.map(cuadre => ({
      id: cuadre.id,
      puestoId: cuadre.puestoId,
      fecha: cuadre.fecha,
      estado: cuadre.estado,
      montoFiado: cuadre.montoFiado,
      montoTransferencia: cuadre.montoTransferencia,
      creadoEn: cuadre.creadoEn,
      actualizadoEn: cuadre.actualizadoEn
    }))
  }
  return filas
})
