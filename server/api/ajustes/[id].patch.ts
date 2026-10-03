import { eq, sql } from 'drizzle-orm'
import { db } from '../../database/client'
import { ajustes, cuadres } from '../../database/schema'
import { requireRole } from '../../utils/auth'
import { exigirPuesto } from '../../utils/puesto'
import { validarTopeCuadre } from '../../utils/fiadoTope'
import { updateAjusteSchema } from '#shared/schemas/updateAjuste'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const id = event.context.params?.id
  if (!id) throw createError({ statusCode: 400, statusMessage: 'ID requerido.' })

  const body = await readBody(event)
  const parsed = updateAjusteSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Datos inválidos.', data: parsed.error.flatten() })
  }
  const cambios = parsed.data

  // 404 si no existe O si es de otro puesto (misma respuesta).
  const ajuste = await exigirPuesto(auth, 'ajustes', id, 'Ajuste')

  const nuevoTipo = cambios.tipo ?? ajuste.tipo
  const nuevaCantidad = cambios.cantidad ?? ajuste.cantidad
  const nuevoMonto = cambios.monto ?? ajuste.monto
  const nuevoProductoId = cambios.productoId ?? ajuste.productoId

  if (nuevaCantidad <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'La cantidad debe ser mayor que cero.' })
  }

  await validarTopeCuadre(
    ajuste.cuadreId,
    [{ productoId: nuevoProductoId, cantidad: nuevaCantidad }],
    { excluirAjusteIds: [id], concepto: nuevoTipo === 'regalo' ? 'regalo' : 'descuento' }
  )

  await db.transaction(async (tx) => {
    await tx
      .update(ajustes)
      .set({
        clienteId: cambios.clienteId !== undefined ? cambios.clienteId : ajuste.clienteId,
        productoId: nuevoProductoId,
        tipo: nuevoTipo,
        cantidad: nuevaCantidad,
        monto: nuevoMonto,
        nota: cambios.nota !== undefined ? cambios.nota : ajuste.nota,
        actualizadoEn: new Date()
      })
      .where(eq(ajustes.id, id))

    // Ajustar el acumulado del cuadre: restar el monto anterior del campo
    // original y sumar el nuevo al campo correspondiente.
    const campoAnterior = ajuste.tipo === 'regalo' ? cuadres.montoRegalo : cuadres.montoDescuento
    await tx
      .update(cuadres)
      .set({ [campoAnterior.name]: sql`GREATEST(${campoAnterior} - ${ajuste.monto}, 0)` })
      .where(eq(cuadres.id, ajuste.cuadreId))

    const campoNuevo = nuevoTipo === 'regalo' ? cuadres.montoRegalo : cuadres.montoDescuento
    await tx
      .update(cuadres)
      .set({ [campoNuevo.name]: sql`${campoNuevo} + ${nuevoMonto}` })
      .where(eq(cuadres.id, ajuste.cuadreId))
  })

  return { id, tipo: nuevoTipo, cantidad: nuevaCantidad, monto: nuevoMonto }
})
