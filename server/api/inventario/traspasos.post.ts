import { eq, and } from 'drizzle-orm'
import { db } from '../../database/client'
import { lotes, movimientosInventario, traspasos } from '../../database/schema'
import { traspasoSchema } from '#shared/schemas/traspaso'
import { construirTraspaso, lotesConSaldo } from '#shared/inventario/operaciones'
import { diaNegocioPlausible } from '#shared/fechas'
import { comoMovimiento, conGuardaStock } from '../../utils/inventario'
import { existentePorId } from '../../utils/idempotencia'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const body = await readBody(event)
  const parsed = traspasoSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Datos inválidos.', data: parsed.error.flatten() })
  }
  const datos = parsed.data
  const puestoId = auth.usuario.puestoId
  const usuarioId = auth.usuario.id
  const ahoraMs = Date.now()

  // La fecha es un día de negocio, no un instante: un equipo adelantado la manda
  // un día por delante solo entre las 23:00 y las 00:00. Ahí se corrige al día
  // del servidor; más allá se rechaza (no es el reloj, es un dato mal puesto).
  const revisada = diaNegocioPlausible(datos.fecha, ahoraMs)
  if (!revisada.ok) {
    if (!revisada.diaAjustado) {
      throw createError({ statusCode: 400, statusMessage: revisada.motivo ?? 'Fecha inválida.' })
    }
    datos.fecha = revisada.diaAjustado
  }

  // Reintento del mismo traspaso: ya movió stock y no se repite.
  const previo = await existentePorId(traspasos, datos.id, puestoId)
  if (previo) {
    const movs = await db
      .select({ id: movimientosInventario.id })
      .from(movimientosInventario)
      .where(eq(movimientosInventario.traspasoId, String(previo.id)))
    return { traspasoId: previo.id, movimientos: movs.length, idempotente: true }
  }

  const ids = [...new Set(datos.lineas.map(l => l.productoId))]
  const filasLotes = await db
    .select()
    .from(lotes)
    .where(and(eq(lotes.puestoId, puestoId), eq(lotes.anulado, false)))
  const movs = await db
    .select()
    .from(movimientosInventario)
    .where(and(eq(movimientosInventario.puestoId, puestoId), eq(movimientosInventario.anulado, false)))

  const lotesPorProducto = new Map(
    ids.map(pid => [pid, lotesConSaldo(filasLotes, movs, pid, 'almacen')])
  )

  const { traspaso, movimientos, faltantes } = construirTraspaso({
    lineas: datos.lineas,
    lotesPorProducto,
    meta: {
      puestoId,
      usuarioId,
      ahora: ahoraMs,
      fecha: datos.fecha,
      notas: datos.notas,
      traspasoId: datos.id
    }
  })

  if (faltantes.length > 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Stock insuficiente en el almacén para uno o más productos.',
      data: { faltantes }
    })
  }

  await conGuardaStock(() => db.transaction(async (tx) => {
    await tx.insert(traspasos).values({
      id: traspaso.id,
      puestoId,
      fecha: datos.fecha,
      notas: traspaso.notas,
      usuarioId
    })
    for (const m of movimientos) {
      await tx.insert(movimientosInventario).values(comoMovimiento(m))
    }
  }))

  return { traspasoId: traspaso.id, movimientos: movimientos.length }
})
