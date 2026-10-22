import { and, eq, inArray, isNull } from 'drizzle-orm'
import { db } from '../../database/client'
import {
  ajustes,
  clientes,
  clientesTelefonos,
  cuentasFiado,
  recargas,
  smsEtecsa,
  transferencias
} from '../../database/schema'
import { requireRole } from '../../utils/auth'
import { CLIENTE_SIN_CLIENTE_ID_FIJO } from '#shared/constants'
import { fusionClienteSchema } from '#shared/schemas/fusionCliente'
import { planificarFusion } from '#shared/clientes'

/**
 * Fusiona dos o más clientes en una identidad única (modo online).
 *
 * Espejo de la acción offline `fusionar` (app/server-offline/index.js): los
 * números pasan al principal conservando su nombre en `etiqueta`, las recargas
 * / deudas / transferencias / ajustes se re-apuntan y el absorbido queda
 * inactivo con `fusionadoEn`, fuera de los listados.
 *
 * Todo en una transacción: una fusión a medias partiría las deudas de un
 * cliente entre dos identidades.
 */
export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const body = await readBody(event)
  const parsed = fusionClienteSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: parsed.error.issues[0]?.message ?? 'Datos inválidos.',
      data: parsed.error.flatten()
    })
  }

  const { ids, nombreFinal } = parsed.data
  const puestoId = auth.usuario.puestoId

  return await db.transaction(async (tx) => {
    const elegidos = await tx
      .select()
      .from(clientes)
      .where(and(
        inArray(clientes.id, ids),
        eq(clientes.puestoId, puestoId),
        isNull(clientes.fusionadoEn)
      ))

    if (elegidos.length !== ids.length) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Alguno de los clientes ya no existe o ya fue fusionado.'
      })
    }
    if (elegidos.some(c => c.id === CLIENTE_SIN_CLIENTE_ID_FIJO)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'El cliente "Sin cliente" no se puede fusionar.'
      })
    }

    const canonico = nombreFinal.trim()
    // Solo los números de los implicados: son los únicos que pueden moverse.
    const telefonos = await tx
      .select()
      .from(clientesTelefonos)
      .where(inArray(clientesTelefonos.clienteId, ids))
    // Las reglas (principal, absorbidos y etiqueta de cada número) son las
    // mismas que usa la fusión offline: viven en `planificarFusion`.
    const plan = planificarFusion({ clientes: elegidos, telefonos, ids, nombreFinal: canonico })

    if (plan.renombrar) {
      await tx
        .update(clientes)
        .set({ nombre: canonico, actualizadoEn: new Date() })
        .where(eq(clientes.id, plan.principal.id))
    }

    const resumen = {
      principalId: plan.principal.id,
      nombre: canonico,
      fusionados: plan.absorbidos.length,
      telefonos: plan.telefonos.length,
      recargas: 0,
      deudas: 0,
      transferencias: 0,
      ajustes: 0,
      sms: 0
    }

    for (const t of plan.telefonos) {
      await tx
        .update(clientesTelefonos)
        .set({
          clienteId: plan.principal.id,
          actualizadoEn: new Date(),
          ...(t.etiqueta ? { etiqueta: t.etiqueta } : {})
        })
        .where(eq(clientesTelefonos.id, t.id))
    }

    for (const abs of plan.absorbidos) {
      const movidas = await tx
        .update(recargas)
        .set({ clienteId: plan.principal.id, actualizadoEn: new Date() })
        .where(eq(recargas.clienteId, abs.id))
        .returning({ id: recargas.id })
      resumen.recargas += movidas.length

      const deudas = await tx
        .update(cuentasFiado)
        .set({ clienteId: plan.principal.id, actualizadoEn: new Date() })
        .where(eq(cuentasFiado.clienteId, abs.id))
        .returning({ id: cuentasFiado.id })
      resumen.deudas += deudas.length

      const transferenciasMovidas = await tx
        .update(transferencias)
        .set({ clienteId: plan.principal.id, actualizadoEn: new Date() })
        .where(eq(transferencias.clienteId, abs.id))
        .returning({ id: transferencias.id })
      resumen.transferencias += transferenciasMovidas.length

      const ajustesMovidos = await tx
        .update(ajustes)
        .set({ clienteId: plan.principal.id, actualizadoEn: new Date() })
        .where(eq(ajustes.clienteId, abs.id))
        .returning({ id: ajustes.id })
      resumen.ajustes += ajustesMovidos.length

      const smsMovidos = await tx
        .update(smsEtecsa)
        .set({ clienteId: plan.principal.id })
        .where(eq(smsEtecsa.clienteId, abs.id))
        .returning({ id: smsEtecsa.id })
      resumen.sms += smsMovidos.length

      const nota = `Fusionado en ${canonico} (${new Date().toLocaleDateString('es-MX')})`
      await tx
        .update(clientes)
        .set({
          activo: false,
          fusionadoEn: plan.principal.id,
          notas: abs.notas ? `${abs.notas} · ${nota}` : nota,
          actualizadoEn: new Date()
        })
        .where(eq(clientes.id, abs.id))
    }

    return { ...plan.principal, nombre: canonico, resumen }
  })
})
