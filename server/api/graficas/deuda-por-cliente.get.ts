import { eq, sql } from 'drizzle-orm'
import { db } from '../../database/client'
import { cuentasFiado, usuarios } from '../../database/schema'
import { requireRole } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireRole(event, 'jefe')
  const rows = await db
    .select({
      clienteId: usuarios.id,
      nombreCliente: usuarios.nombre,
      deudaTotal: sql<number>`sum(${cuentasFiado.montoTotal} - ${cuentasFiado.montoPagado})`
    })
    .from(cuentasFiado)
    .innerJoin(usuarios, eq(cuentasFiado.clienteId, usuarios.id))
    .where(eq(cuentasFiado.estado, 'pendiente'))
    .groupBy(usuarios.id, usuarios.nombre)
    .orderBy(sql`2 desc`)
  return rows.map(r => ({ clienteId: r.clienteId, nombreCliente: r.nombreCliente, deudaTotal: Number(r.deudaTotal) }))
})
