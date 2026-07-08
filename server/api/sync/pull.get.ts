import { gt, and } from 'drizzle-orm'
import { db } from '../../database/client'
import {
  productos,
  historialPrecios,
  cuadres,
  cuadreItems,
  usuarios,
  clientes,
  cuentasFiado,
  cuentasFiadoItems,
  pagosFiado
} from '../../database/schema'
import { requireAuth } from '../../utils/auth'
import type { PullResponse, Producto, HistorialPrecio, Cuadre, CuadreItem, Usuario, Cliente, CuentaFiado, CuentaFiadoItem, PagoFiado } from '../../../shared/types'

/**
 * GET /api/sync/pull?desde=<timestamp_ms>
 *
 * Devuelve todos los registros con `actualizado_en > desde` (o creado_en > desde
 * para historial) en las tablas sincronizables. El cliente usa la respuesta
 * para actualizar su copia local y luego guarda el `timestamp_servidor`
 * retornado como nuevo `ultima_sincronizacion_en`.
 *
 * Si no se pasa `desde`, devuelve todo (útil para la primera sincronización).
 */
export default defineEventHandler(async (event): Promise<PullResponse> => {
  await requireAuth(event, 'sync')

  const query = getQuery(event)
  const desdeRaw = query.desde
  const desdeMs = typeof desdeRaw === 'string' ? Number(desdeRaw) : 0
  const desde = new Date(isNaN(desdeMs) ? 0 : desdeMs)

  const [prods, hist, cuad, items, users, clis, cuentas, citems, pags] = await Promise.all([
    db
      .select()
      .from(productos)
      .where(gt(productos.actualizadoEn, desde)),
    db
      .select()
      .from(historialPrecios)
      .where(gt(historialPrecios.creadoEn, desde)),
    db
      .select()
      .from(cuadres)
      .where(gt(cuadres.actualizadoEn, desde)),
    db
      .select()
      .from(cuadreItems)
      .where(gt(cuadreItems.actualizadoEn, desde)),
    db
      .select()
      .from(usuarios)
      .where(and(gt(usuarios.actualizadoEn, desde))),
    db
      .select()
      .from(clientes)
      .where(gt(clientes.actualizadoEn, desde)),
    db
      .select()
      .from(cuentasFiado)
      .where(gt(cuentasFiado.actualizadoEn, desde)),
    db
      .select()
      .from(cuentasFiadoItems)
      .where(gt(cuentasFiadoItems.creadoEn, desde)),
    db
      .select()
      .from(pagosFiado)
      .where(gt(pagosFiado.creadoEn, desde))
  ])

  return {
    productos: prods.map(p => ({
      id: p.id,
      puestoId: p.puestoId,
      nombre: p.nombre,
      descripcion: p.descripcion,
      activo: p.activo,
      orden: p.orden,
      precioCompraActual: Number(p.precioCompraActual),
      precioVentaActual: Number(p.precioVentaActual),
      creadoEn: p.creadoEn.toISOString(),
      actualizadoEn: p.actualizadoEn.toISOString()
    } satisfies Producto)),
    historial_precios: hist.map(h => ({
      id: h.id,
      productoId: h.productoId,
      precioCompra: Number(h.precioCompra),
      precioVenta: Number(h.precioVenta),
      vigenteDesde: h.vigenteDesde.toISOString(),
      vigenteHasta: h.vigenteHasta?.toISOString() ?? null,
      cambiadoPor: h.cambiadoPor,
      creadoEn: h.creadoEn.toISOString()
    } satisfies HistorialPrecio)),
    cuadres: cuad.map(c => ({
      id: c.id,
      puestoId: c.puestoId,
      fecha: c.fecha,
      jefeId: c.jefeId,
      trabajadorTurnoId: c.trabajadorTurnoId,
      pagoTrabajador: c.pagoTrabajador != null ? Number(c.pagoTrabajador) : null,
      totalEsperado: Number(c.totalEsperado),
      totalRealCaja: c.totalRealCaja != null ? Number(c.totalRealCaja) : null,
      montoTransferencia: Number(c.montoTransferencia),
      montoFiado: Number(c.montoFiado),
      diferencia: c.diferencia != null ? Number(c.diferencia) : null,
      estado: c.estado,
      notas: c.notas,
      cerradoEn: c.cerradoEn?.toISOString() ?? null,
      reabiertoVeces: c.reabiertoVeces,
      ultimaReaperturaEn: c.ultimaReaperturaEn?.toISOString() ?? null,
      creadoEn: c.creadoEn.toISOString(),
      actualizadoEn: c.actualizadoEn.toISOString()
    } satisfies Cuadre)),
    cuadre_items: items.map(i => ({
      id: i.id,
      cuadreId: i.cuadreId,
      productoId: i.productoId,
      precioVentaUsado: Number(i.precioVentaUsado),
      cantidad: Number(i.cantidad),
      subtotal: Number(i.subtotal),
      tipoLinea: i.tipoLinea,
      nota: i.nota,
      esExtra: i.esExtra,
      creadoEn: i.creadoEn.toISOString(),
      actualizadoEn: i.actualizadoEn.toISOString()
    } satisfies CuadreItem)),
    usuarios: users.map(u => ({
      id: u.id,
      puestoId: u.puestoId,
      nombre: u.nombre,
      rol: u.rol,
      pinHash: u.pinHash,
      activo: u.activo,
      salario: Number(u.salario),
      creadoEn: u.creadoEn.toISOString(),
      actualizadoEn: u.actualizadoEn.toISOString()
    } satisfies Usuario)),
    clientes: clis.map(c => ({
      id: c.id,
      puestoId: c.puestoId,
      nombre: c.nombre,
      telefono: c.telefono,
      notas: c.notas,
      activo: c.activo,
      creadoEn: c.creadoEn.toISOString(),
      actualizadoEn: c.actualizadoEn.toISOString()
    } satisfies Cliente)),
    cuentas_fiado: cuentas.map(c => ({
      id: c.id,
      puestoId: c.puestoId,
      clienteId: c.clienteId,
      cuadreOrigenId: c.cuadreOrigenId,
      montoTotal: Number(c.montoTotal),
      montoPagado: Number(c.montoPagado),
      estado: c.estado,
      creadoEn: c.creadoEn.toISOString(),
      actualizadoEn: c.actualizadoEn.toISOString()
    } satisfies CuentaFiado)),
    cuentas_fiado_items: citems.map(i => ({
      id: i.id,
      cuentaFiadoId: i.cuentaFiadoId,
      productoId: i.productoId,
      cantidad: Number(i.cantidad),
      precioVentaUsado: Number(i.precioVentaUsado),
      subtotal: Number(i.subtotal),
      creadoEn: i.creadoEn.toISOString()
    } satisfies CuentaFiadoItem)),
    pagos_fiado: pags.map(p => ({
      id: p.id,
      cuentaFiadoId: p.cuentaFiadoId,
      cuadreId: p.cuadreId,
      monto: Number(p.monto),
      formaPago: p.formaPago,
      creadoEn: p.creadoEn.toISOString()
    } satisfies PagoFiado)),
    timestamp_servidor: Date.now()
  }
})
