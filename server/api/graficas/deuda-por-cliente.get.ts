import { eq, sql } from 'drizzle-orm'
import { db } from '../../database/client'
import { cuentasFiado, clientes } from '../../database/schema'
import { requireRole } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireRole(event, 'jefe')
  const rows = await db
    .select({
      clienteId: clientes.id,
      nombreCliente: clientes.nombre,
      deudaTotal: sql<number>`sum(${cuentasFiado.montoTotal} - ${cuentasFiado.montoPagado})`
    })
    .from(cuentasFiado)
    .innerJoin(clientes, eq(cuentasFiado.clienteId, clientes.id))
    .where(eq(cuentasFiado.estado, 'pendiente'))
    .groupBy(clientes.id, clientes.nombre)
    .orderBy(sql`2 desc`)
  return rows.map(r => ({ clienteId: r.clienteId, nombreCliente: r.nombreCliente, deudaTotal: Number(r.deudaTotal) }))
})
