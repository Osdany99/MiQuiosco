import { eq, and, gte, lte, desc, sql } from 'drizzle-orm'
import { db } from '../../database/client'
import { cuentasFiado, clientes } from '../../database/schema'
import { requireRole } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const query = getQuery(event)
  // Siempre el puesto propio (ver transferencias/index.get.ts).
  const conditions = [eq(cuentasFiado.puestoId, auth.usuario.puestoId)]

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
      nombreCliente: clientes.nombre,
      cuadreOrigenId: cuentasFiado.cuadreOrigenId,
      montoTotal: cuentasFiado.montoTotal,
      montoPagado: cuentasFiado.montoPagado,
      costoTotal: cuentasFiado.costoTotal,
      ganancia: cuentasFiado.ganancia,
      estado: cuentasFiado.estado,
      creadoEn: cuentasFiado.creadoEn,
      actualizadoEn: cuentasFiado.actualizadoEn
    })
    .from(cuentasFiado)
    // clienteId apunta a clientes desde la 0018: el join contra usuarios hacia
    // INVISIBLES las deudas nuevas en este listado.
    .innerJoin(clientes, eq(cuentasFiado.clienteId, clientes.id))
    .where(and(...conditions))
    .orderBy(desc(cuentasFiado.creadoEn))

  return rows.map(r => ({
    id: r.id,
    clienteId: r.clienteId,
    nombreCliente: r.nombreCliente,
    cuadreOrigenId: r.cuadreOrigenId,
    // Deuda directa: fiada por fuera de cualquier cuadre.
    directa: r.cuadreOrigenId === null,
    montoTotal: r.montoTotal,
    montoPagado: r.montoPagado,
    saldoPendiente: r.montoTotal - r.montoPagado,
    costoTotal: r.costoTotal,
    ganancia: r.ganancia,
    estado: r.estado,
    creadoEn: r.creadoEn.toISOString(),
    actualizadoEn: r.actualizadoEn.toISOString()
  }))
})
