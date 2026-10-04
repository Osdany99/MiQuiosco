import { eq } from 'drizzle-orm'
import { db } from '../../database/client'
import { clientes, clientesTelefonos } from '../../database/schema'
import { requireRole } from '../../utils/auth'
import { updateClienteTelefonoSchema } from '#shared/schemas/clienteTelefono'

/**
 * Edita un teléfono: cambiar de cliente, poner etiqueta o (des)activarlo.
 *
 * El `telefono` es UNIQUE en toda la tabla porque es la clave con la que se
 * empareja cada recarga que entra. Por eso el cambio de cliente se hace sobre la
 * fila existente: no se puede crear una segunda fila con el mismo número.
 */
export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const body = await readBody(event)
  const parsed = updateClienteTelefonoSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Datos inválidos.', data: parsed.error.flatten() })
  }

  const id = String(event.context.params?.id ?? '')
  const cambios = parsed.data
  if (!Object.keys(cambios).length) {
    throw createError({ statusCode: 400, statusMessage: 'Nada que actualizar.' })
  }

  if (cambios.clienteId) {
    const [destino] = await db
      .select({ id: clientes.id, puestoId: clientes.puestoId })
      .from(clientes)
      .where(eq(clientes.id, cambios.clienteId))
    if (!destino || destino.puestoId !== auth.usuario.puestoId) {
      throw createError({ statusCode: 404, statusMessage: 'Cliente no encontrado.' })
    }
  }

  const [t] = await db
    .update(clientesTelefonos)
    .set({ ...cambios, actualizadoEn: new Date() })
    .where(eq(clientesTelefonos.id, id))
    .returning()

  if (!t) {
    throw createError({ statusCode: 404, statusMessage: 'Teléfono no encontrado.' })
  }
  return {
    id: t.id,
    puestoId: t.puestoId,
    clienteId: t.clienteId,
    telefono: t.telefono,
    telefonoRaw: t.telefonoRaw,
    etiqueta: t.etiqueta,
    activo: t.activo,
    actualizadoEn: t.actualizadoEn.toISOString()
  }
})
