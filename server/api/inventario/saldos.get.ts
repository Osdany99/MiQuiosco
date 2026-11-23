import { eq, and } from 'drizzle-orm'
import { db } from '../../database/client'
import { lotes, movimientosInventario, productos } from '../../database/schema'
import { vistaSaldos } from '#shared/inventario/vista'
import { filtrarCostosTrabajador, requirePermiso } from '../../utils/permisos'

export default defineEventHandler(async (event) => {
  const auth = await requirePermiso(event, {
    jefe: null,
    trabajador: 'acciones.cuadre.fiar'
  })
  const puestoId = auth.usuario.puestoId

  const [filasProductos, filasLotes, movs] = await Promise.all([
    db.select().from(productos).where(eq(productos.puestoId, puestoId)),
    db.select().from(lotes).where(and(eq(lotes.puestoId, puestoId), eq(lotes.anulado, false))),
    db
      .select()
      .from(movimientosInventario)
      .where(and(eq(movimientosInventario.puestoId, puestoId), eq(movimientosInventario.anulado, false)))
  ])

  return filtrarCostosTrabajador(auth, vistaSaldos({ productos: filasProductos, lotes: filasLotes, movimientos: movs }))
})
