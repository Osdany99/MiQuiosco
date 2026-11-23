import { eq, and } from 'drizzle-orm'
import { db } from '../../database/client'
import { lotes, movimientosInventario } from '../../database/schema'
import { anulacionLoteSchema } from '#shared/schemas/lote'
import { construirAnulacionLote } from '#shared/inventario/operaciones'
import { comoAnulacionLote, conGuardaStock } from '../../utils/inventario'

/**
 * Anula (no borra) una entrada equivocada al almacén.
 *
 * Es el caso de "di entrada a 10 refrescos y eran 10 panes": corregir la
 * cantidad o el precio no arregla el producto equivocado, así que se invalida
 * la entrada entera y se vuelve a dar de alta la buena.
 *
 * Solo se permite mientras NADA del lote se haya movido. La regla vive en
 * shared/inventario/operaciones.js (evaluarAnulacionLote), la misma que aplica
 * el camino offline; aquí solo se traduce a un error HTTP.
 *
 * Se marca `anulado` en la cabecera y en su movimiento de entrada, igual que
 * `anularVentaDirecta` con las ventas: el libro es append-only y el flag ya
 * existe, así que el cambio viaja por el sync sin tocar el esquema. No se
 * escribe un movimiento de contrapartida porque no hay stock que compensar.
 */
export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const id = event.context.params!.id as string
  const body = await readBody(event)
  const parsed = anulacionLoteSchema.safeParse(body)
  if (!parsed.success) {
    const primer = parsed.error.issues[0]?.message ?? 'Datos inválidos.'
    throw createError({ statusCode: 400, statusMessage: primer, data: parsed.error.flatten() })
  }

  const [lote] = await db.select().from(lotes).where(eq(lotes.id, id)).limit(1)
  if (!lote || lote.puestoId !== auth.usuario.puestoId) {
    throw createError({ statusCode: 404, statusMessage: 'Lote no encontrado.' })
  }

  // Todos los movimientos NO anulados del puesto: `saldosDeLote` (y con él la
  // regla de anulación) se apoya en el libro completo para decidir si salió
  // mercancía, así que no basta con los del lote.
  const movs = await db
    .select()
    .from(movimientosInventario)
    .where(
      and(eq(movimientosInventario.puestoId, auth.usuario.puestoId), eq(movimientosInventario.anulado, false))
    )

  let plan
  try {
    plan = comoAnulacionLote(construirAnulacionLote({
      lote,
      movimientos: movs,
      datos: parsed.data,
      meta: { ahora: Date.now(), usuarioId: auth.usuario.id }
    }))
  } catch (err) {
    throw createError({ statusCode: 409, statusMessage: (err as Error).message })
  }

  if (!plan.movimientosActualizados.length) {
    // Lote sin movimiento de entrada en el libro (importado a mano): solo se
    // anularía la cabecera y eso no quita stock de ningún sitio. Es un dato
    // inconsistente; mejor que lo revise el jefe.
    throw createError({
      statusCode: 409,
      statusMessage: 'Este lote no tiene su movimiento de entrada en el libro: corrige el stock con una merma.'
    })
  }

  const { actualizadoEn: ts, ...camposLote } = plan.cambiosLote
  const ahora = new Date(ts)

  await conGuardaStock(() => db.transaction(async (tx) => {
    await tx
      .update(lotes)
      .set({ ...camposLote, actualizadoEn: ahora })
      .where(eq(lotes.id, id))

    // Solo la fila de entrada del lote: si hubiera otra cosa viva, el plan ya
    // habría lanzado (el libro quedó intacto cuando no se podía anular).
    for (const { id: movId, ...campos } of plan.movimientosActualizados) {
      // El plan trabaja en epoch ms (lo mismo que necesita el sqlite); Postgres
      // exige Date en las columnas timestamp.
      const paraPg: Record<string, unknown> = { ...campos, actualizadoEn: ahora }
      if (typeof paraPg.anuladoEn === 'number') paraPg.anuladoEn = new Date(paraPg.anuladoEn)
      await tx
        .update(movimientosInventario)
        .set(paraPg)
        .where(eq(movimientosInventario.id, movId))
    }
  }))

  return {
    id,
    anulado: true,
    almacen: plan.almacen,
    quiosco: plan.quiosco,
    movimientos: plan.movimientosActualizados.length
  }
})
