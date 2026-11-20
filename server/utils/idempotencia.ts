import { type SQLWrapper, eq } from 'drizzle-orm'
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
 *
 * @param tabla tabla Drizzle (su columna `id` es la que se busca)
 * @param id id que mandó el cliente, si lo mandó
 * @param puestoId puesto del que viene la petición
 */
export async function existentePorId(
  tabla: { id: SQLWrapper },
  id: string | null | undefined,
  puestoId: string
) {
  const clave = String(id ?? '').trim()
  if (!clave) return null

  // `db as unknown as { … }`: el genérico de `select().from()` de Drizzle no se
  // deja parametrizar; aquí solo se necesita una lectura por id.
  const query = db as unknown as {
    select: () => {
      from: <R>(t: unknown) => {
        where: (cond: SQLWrapper) => {
          limit: (n: number) => Promise<R[]>
        }
      }
    }
  }

  const filas = await query
    .select()
    .from<Record<string, unknown>>(tabla)
    .where(eq(tabla.id, clave))
    .limit(1)
  const previa = filas[0] as (Record<string, unknown> & { puestoId?: string | null }) | undefined
  if (!previa) return null

  if (previa.puestoId && previa.puestoId !== puestoId) {
    throw createError({ statusCode: 409, statusMessage: 'Ese id ya está usado en otro puesto.' })
  }
  return previa
}
