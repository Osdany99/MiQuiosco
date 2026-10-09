import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { db } from '../../../database/client'
import { cuadres, cuadreItems, lotes, movimientosInventario } from '../../../database/schema'
import { construirVentaCuadre, lotesConSaldo } from '#shared/inventario/operaciones'
import { comoMovimiento } from '../../../utils/inventario'

const lineaSchema = z.object({
  id: z.string().uuid(),
  productoId: z.string().uuid(),
  precioVentaUsado: z.number().min(0),
  cantidad: z.number().min(0),
  subtotal: z.number().min(0),
  tipoLinea: z.enum(['normal', 'descuento', 'regalo', 'deuda', 'descuento_familiar']).default('normal'),
  nota: z.string().nullable().optional(),
  esExtra: z.boolean().default(false),
  secuencia: z.number().int().min(0).default(0)
})

const cerrarCuadreSchema = z.object({
  totalEsperado: z.number().min(0),
  totalRealCaja: z.number().min(0),
  montoTransferencia: z.number().min(0).default(0),
  montoFiado: z.number().min(0).default(0),
  montoCobradoFiado: z.number().min(0).default(0),
  montoRegalo: z.number().min(0).default(0),
  montoDescuento: z.number().min(0).default(0),
  trabajadorTurnoId: z.string().uuid().nullable().optional(),
  pagoTrabajador: z.number().min(0).nullable().optional(),
  notas: z.string().nullable().optional(),
  lineas: z.array(lineaSchema).default([])
})

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const id = event.context.params!.id as string
  const body = await readBody(event)
  const parsed = cerrarCuadreSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Datos inválidos.', data: parsed.error.flatten() })
  }
  const datos = parsed.data
  const puestoId = auth.usuario.puestoId
  const usuarioId = auth.usuario.id
  const ahora = new Date()
  const ahoraMs = ahora.getTime()

  const [cuadre] = await db.select().from(cuadres).where(eq(cuadres.id, id)).limit(1)
  if (!cuadre || cuadre.puestoId !== puestoId) {
    throw createError({ statusCode: 404, statusMessage: 'Cuadre no encontrado.' })
  }
  if (cuadre.estado !== 'abierto') {
    throw createError({ statusCode: 409, statusMessage: 'El cuadre ya está cerrado.' })
  }

  const resultado = await db.transaction(async (tx) => {
    // 1. Sincronizar líneas (crear / actualizar / eliminar por id).
    const existentes = await tx.select().from(cuadreItems).where(eq(cuadreItems.cuadreId, id))
    const porId = new Map(existentes.map(e => [e.id, e]))
    const vistas = new Set<string>()
    for (const l of datos.lineas) {
      vistas.add(l.id)
      const prev = porId.get(l.id)
      if (prev) {
        const cambia = Number(prev.cantidad) !== Number(l.cantidad)
          || Number(prev.precioVentaUsado) !== Number(l.precioVentaUsado)
          || prev.tipoLinea !== l.tipoLinea
          || (prev.nota ?? null) !== (l.nota ?? null)
          || (prev.esExtra ?? false) !== l.esExtra
          || Number(prev.secuencia ?? 0) !== Number(l.secuencia)
        if (cambia) {
          await tx.update(cuadreItems).set({
            precioVentaUsado: l.precioVentaUsado,
            cantidad: l.cantidad,
            subtotal: l.subtotal,
            tipoLinea: l.tipoLinea,
            nota: l.nota ?? null,
            esExtra: l.esExtra,
            secuencia: l.secuencia
          }).where(eq(cuadreItems.id, l.id))
        }
      } else {
        await tx.insert(cuadreItems).values({
          id: l.id,
          cuadreId: id,
          productoId: l.productoId,
          precioVentaUsado: l.precioVentaUsado,
          cantidad: l.cantidad,
          subtotal: l.subtotal,
          tipoLinea: l.tipoLinea,
          nota: l.nota ?? null,
          esExtra: l.esExtra,
          secuencia: l.secuencia
        })
      }
    }
    for (const e of existentes) {
      if (!vistas.has(e.id)) await tx.delete(cuadreItems).where(eq(cuadreItems.id, e.id))
    }

    // 2. FIFO sobre el quiosco, en orden de secuencia.
    const lineasVenta = datos.lineas
      .filter(l => Number(l.cantidad) > 0)
      .sort((a, b) => Number(a.secuencia ?? 0) - Number(b.secuencia ?? 0))
      .map(l => ({ id: l.id, productoId: l.productoId, cantidad: l.cantidad }))
    const ids = [...new Set(lineasVenta.map(l => l.productoId))]

    let movimientos: Awaited<ReturnType<typeof construirVentaCuadre>>['movimientos'] = []
    let costoTotal = 0
    let faltantes: Awaited<ReturnType<typeof construirVentaCuadre>>['faltantes'] = []
    if (ids.length > 0) {
      const [filasLotes, movs] = await Promise.all([
        tx.select().from(lotes).where(and(eq(lotes.puestoId, puestoId), eq(lotes.anulado, false))),
        tx.select().from(movimientosInventario).where(
          and(eq(movimientosInventario.puestoId, puestoId), eq(movimientosInventario.anulado, false))
        )
      ])
      const lotesPorProducto = new Map(
        ids.map(pid => [pid, lotesConSaldo(filasLotes, movs, pid, 'quiosco')])
      )
      const venta = construirVentaCuadre({
        lineas: lineasVenta,
        lotesPorProducto,
        cuadreId: id,
        meta: { puestoId, usuarioId, ahora: ahoraMs }
      })
      movimientos = venta.movimientos
      costoTotal = venta.costoTotal
      faltantes = venta.faltantes
      for (const m of movimientos) {
        await tx.insert(movimientosInventario).values(comoMovimiento(m))
      }
    }

    // 3. Cerrar con costo y ganancia congelados.
    const redondear2 = (n: number) => Math.round(n * 100) / 100
    const costo = redondear2(costoTotal)
    const ganancia = redondear2(datos.totalEsperado - costo)
    const diferencia = redondear2(
      (datos.totalRealCaja + datos.montoTransferencia + datos.montoFiado) - datos.totalEsperado
    )
    await tx.update(cuadres).set({
      estado: 'cerrado',
      totalEsperado: datos.totalEsperado,
      totalRealCaja: datos.totalRealCaja,
      montoTransferencia: datos.montoTransferencia,
      montoFiado: datos.montoFiado,
      montoCobradoFiado: datos.montoCobradoFiado,
      montoRegalo: datos.montoRegalo,
      montoDescuento: datos.montoDescuento,
      diferencia,
      costoTotal: costo,
      ganancia,
      trabajadorTurnoId: datos.trabajadorTurnoId ?? null,
      pagoTrabajador: datos.pagoTrabajador ?? null,
      notas: datos.notas ?? null,
      cerradoEn: ahora
    }).where(eq(cuadres.id, id))

    return { costoTotal: costo, ganancia, diferencia, faltantes }
  })

  return resultado
})
