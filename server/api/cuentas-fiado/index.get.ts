import { eq, and, gte, lte, desc, sql } from 'drizzle-orm'
import { db } from '../../database/client'
import { cuentasFiado, usuarios } from '../../database/schema'
import { requireRole } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireRole(event, 'jefe')
  const query = getQuery(event)
  const conditions = []

  if (query.clienteId) {
    conditions.push(eq(cuentasFiado.clienteId, String(query.clienteId)))
  }
  if (query.estado) {
    const e = String(query.estado)
    if (['pendiente', 'parcial', 'pagada'].includes(e)) {
      conditions.push(eq(cuentasFiado.estado, sql`${e}::estado_cuenta_fiado`))
    }
  }
  if (query.cuadre_origen_id) {
    conditions.push(eq(cuentasFiado.cuadreOrigenId, String(query.cuadre_origen_id)))
  }
  if (query.desde) {
    conditions.push(gte(cuentasFiado.creadoEn, new Date(String(query.desde))))
  }
  if (query.hasta) {
    conditions.push(lte(cuentasFiado.creadoEn, new Date(String(query.hasta))))
  }

  const rows = await db
    .select({
      id: cuentasFiado.id,
      clienteId: cuentasFiado.clienteId,
      nombreCliente: usuarios.nombre,
      cuadreOrigenId: cuentasFiado.cuadreOrigenId,
      montoTotal: cuentasFiado.montoTotal,
      montoPagado: cuentasFiado.montoPagado,
      estado: cuentasFiado.estado,
      creadoEn: cuentasFiado.creadoEn,
      actualizadoEn: cuentasFiado.actualizadoEn
    })
    .from(cuentasFiado)
    .innerJoin(usuarios, eq(cuentasFiado.clienteId, usuarios.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(cuentasFiado.creadoEn))

  return rows.map(r => ({
    id: r.id,
    clienteId: r.clienteId,
    nombreCliente: r.nombreCliente,
    cuadreOrigenId: r.cuadreOrigenId,
    montoTotal: r.montoTotal,
    montoPagado: r.montoPagado,
    saldoPendiente: r.montoTotal - r.montoPagado,
    estado: r.estado,
    creadoEn: r.creadoEn.toISOString(),
    actualizadoEn: r.actualizadoEn.toISOString()
  }))
})
