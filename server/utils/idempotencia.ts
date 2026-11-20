import { eq } from 'drizzle-orm'
import { db } from '../database/client'

/**
 * Alta idempotente: devuelve la fila que ya ocupa el id que mandó el cliente.
 *
 * El patrón es siempre el mismo en las transacciones (venta, deuda, cobro,
 * traspaso…): el cliente decide el id antes de enviar, y si la petición se
 * reintenta (red que se corta después de escribir, doble toque, cola de sync)
 * el servidor devuelve lo que ya existe en vez de volver a mover stock o dinero.
 *
 * Sin id no se busca nada: las llamadas antiguas siguen creando una fila nueva.
 * Un id de otro puesto responde 409, igual que un choque entre puestos.
 */
export async function existentePorId(
  tabla: any,
  id: string | null | undefined,
  puestoId: string
) {
  const clave = String(id ?? '').trim()
  if (!clave) return null
  const [fila] = await db.select().from(tabla).where(eq(tabla.id, clave)).limit(1)
  if (!fila) return null
  if (fila.puestoId && fila.puestoId !== puestoId) {
    throw createError({ statusCode: 409, statusMessage: 'Ese id ya está usado en otro puesto.' })
  }
  return fila
}
