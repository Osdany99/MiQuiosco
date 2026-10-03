import { and, desc, eq, gte, lte, sql } from 'drizzle-orm'
import { db } from '../../database/client'
import { clientes, recargas } from '../../database/schema'
import { requireRole } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const query = getQuery(event)
  const conditions = [eq(recargas.puestoId, auth.usuario.puestoId)]

  if (query.clienteId) {
    conditions.push(eq(recargas.clienteId, String(query.clienteId)))
  }
  if (query.sinAsignar === '1') {
    conditions.push(sql`${recargas.clienteId} IS NULL`)
  }
  if (query.estadoPago) {
    const e = String(query.estadoPago)
    if (e === 'pagada' || e === 'pendiente') {
      conditions.push(eq(recargas.estadoPago, sql`${e}::estado_pago_recarga`))
    }
  }
  // Se acepta el nombre de la columna (`telefonoDestino`) para que el filtro de
  // la tabla use la misma clave en remoto y en local.
  const tel = query.telefonoDestino ?? query.telefono
  if (tel) {
    conditions.push(eq(recargas.telefonoDestino, String(tel)))
  }
  if (query.plataforma) {
    const p = String(query.plataforma)
    if (p === 'banco' || p === 'monedero') {
      conditions.push(eq(recargas.plataforma, sql`${p}::plataforma_recarga`))
    }
  }
  if (query.desde) {
    conditions.push(gte(recargas.creadoEn, new Date(String(query.desde))))
  }
  if (query.hasta) {
    conditions.push(lte(recargas.creadoEn, new Date(String(query.hasta))))
  }

  const rows = await db
    .select({
      id: recargas.id,
      puestoId: recargas.puestoId,
      clienteId: recargas.clienteId,
      nombreCliente: clientes.nombre,
      telefonoDestino: recargas.telefonoDestino,
      telefonoRaw: recargas.telefonoRaw,
      plataforma: recargas.plataforma,
      tipo: recargas.tipo,
      descripcion: recargas.descripcion,
      unidades: recargas.unidades,
      montoNominal: recargas.montoNominal,
      costo: recargas.costo,
      ganancia: recargas.ganancia,
      idTransaccion: recargas.idTransaccion,
      estadoPago: recargas.estadoPago,
      montoCobrado: recargas.montoCobrado,
      smsId: recargas.smsId,
      creadoEn: recargas.creadoEn,
      actualizadoEn: recargas.actualizadoEn
    })
    .from(recargas)
    .leftJoin(clientes, eq(recargas.clienteId, clientes.id))
    .where(and(...conditions))
    .orderBy(desc(recargas.creadoEn))

  return rows.map(r => ({
    ...r,
    saldoPendiente: r.montoNominal - r.montoCobrado,
    creadoEn: r.creadoEn.toISOString(),
    actualizadoEn: r.actualizadoEn.toISOString()
  }))
})
