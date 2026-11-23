import { requirePermiso } from '../../utils/permisos'
import { crudCreate } from '../../utils/crud'
import { clienteSchema } from '#shared/schemas/cliente'
import { CLIENTE_SIN_CLIENTE_NOMBRE } from '#shared/constants'

export default defineEventHandler(async (event) => {
  const auth = await requirePermiso(event, {
    jefe: 'acciones.clientes.crear',
    trabajador: ['acciones.cuadre.fiar', 'acciones.cuadre.transferencia']
  })
  const body = await readBody(event)
  // La voz solo necesita reparar el centinela; nunca crea clientes arbitrarios
  // con la identidad limitada del trabajador.
  if (auth.usuario.rol === 'trabajador'
    && (body?.nombre !== CLIENTE_SIN_CLIENTE_NOMBRE || body?.esCentinela !== true)) {
    throw createError({ statusCode: 403, statusMessage: 'El trabajador no puede crear clientes.' })
  }
  return await crudCreate({ tabla: 'clientes', schema: clienteSchema, puestoScoped: true }, { body, auth })
})
