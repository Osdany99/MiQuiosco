import { and, eq } from 'drizzle-orm'
import { db } from '../../database/client'
import { clientes, clientesTelefonos } from '../../database/schema'
import { requireRole } from '../../utils/auth'
import { clienteTelefonoSchema } from '#shared/schemas/clienteTelefono'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const body = await readBody(event)
  const parsed = clienteTelefonoSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Datos inválidos.', data: parsed.error.flatten() })
  }

  const datos = parsed.data

  const [cliente] = await db
    .select({ id: clientes.id, puestoId: clientes.puestoId })
    .from(clientes)
    .where(eq(clientes.id, datos.clienteId))
  if (!cliente || cliente.puestoId !== auth.usuario.puestoId) {
    throw createError({ statusCode: 404, statusMessage: 'Cliente no encontrado.' })
  }

  // Un número pertenece a un solo cliente: es la clave con la que se empareja
  // cada recarga que entra, así que duplicarlo partiría la deuda en dos.
  const [ocupado] = await db
    .select({ id: clientesTelefonos.id, clienteId: clientesTelefonos.clienteId })
    .from(clientesTelefonos)
    .where(and(eq(clientesTelefonos.telefono, datos.telefono), eq(clientesTelefonos.activo, true)))
  if (ocupado) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Ese número ya está asignado a otro cliente.',
      data: { id: ocupado.id, clienteId: ocupado.clienteId }
    })
  }

  const [r] = await db
    .insert(clientesTelefonos)
    .values({
      puestoId: auth.usuario.puestoId,
      clienteId: datos.clienteId,
      telefono: datos.telefono,
      telefonoRaw: datos.telefonoRaw ?? datos.telefono,
      etiqueta: datos.etiqueta ?? null,
      activo: datos.activo
    })
    .returning()

  const t = r!
  return {
    id: t.id,
    puestoId: t.puestoId,
    clienteId: t.clienteId,
    telefono: t.telefono,
    telefonoRaw: t.telefonoRaw,
    etiqueta: t.etiqueta,
    activo: t.activo,
    creadoEn: t.creadoEn.toISOString(),
    actualizadoEn: t.actualizadoEn.toISOString()
  }
})
