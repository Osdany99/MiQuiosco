/**
 * app/utils/voice/snapshot.js — foto del catálogo para consultas nativas (puro).
 *
 * Con la app cerrada no hay Vue ni SQLite en JS: el servicio en primer plano
 * solo puede leer un JSON. Aquí se arma esa foto con el catálogo, el stock
 * proyectado (descontando lo pendiente de revisar) y el resumen del día.
 *
 * Sin dependencias: se prueba con `node --test` (tests/pendientesVoz.test.js).
 */
import { proyectarStock, resumenPendientes } from './pendientes.js'

export const SNAPSHOT_VERSION = 2

function redondear2(valor) {
  return Math.round((Number(valor) || 0) * 100) / 100
}

/** Número tolerante: null/undefined/no numérico cuentan como 0. */
function numero(valor) {
  const n = Number(valor)
  return Number.isFinite(n) ? n : 0
}

/** Epoch ms tolerante: SQLite guarda números, el servidor puede mandar ISO. */
function ms(valor) {
  if (valor == null) return 0
  if (typeof valor === 'number') return valor
  const n = Number(valor)
  if (Number.isFinite(n)) return n
  const parsed = Date.parse(String(valor))
  return Number.isNaN(parsed) ? 0 : parsed
}

/** Inicio del día local en epoch ms. */
export function inicioDelDia(ahora = Date.now()) {
  const d = new Date(ahora)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/**
 * @param {object} opciones
 * @param {string|null} opciones.puestoId
 * @param {Array} opciones.filas Catálogo de `cargarSaldos()`.
 * @param {Array} opciones.acciones Acciones pendientes de revisión.
 * @param {Array} opciones.ventas Ventas directas (para el resumen del día).
 * @param {number} opciones.ahora
 */
export function construirSnapshot({ puestoId = null, filas = [], acciones = [], ventas = [], ahora = Date.now() } = {}) {
  const proyectadas = proyectarStock(filas, acciones)
  const productos = proyectadas
    .map((fila) => {
      // `quiosco`/`almacen` vienen proyectados (real − pendiente). Se guardan
      // además el real y lo apartado para que el servicio pueda explicar la
      // diferencia: "sólo quedan 1 libres, 2 están por revisar" no se puede
      // decir con un solo número.
      const quiosco = numero(fila?.quiosco)
      const almacen = numero(fila?.almacen)
      return {
        id: String(fila?.productoId ?? fila?.id ?? ''),
        nombre: String(fila?.nombre ?? ''),
        descripcion: fila?.descripcion ? String(fila.descripcion) : null,
        quiosco,
        almacen,
        // Sin pendientes, `proyectarStock` no añade estos campos: el real es
        // el proyectado y lo apartado es cero.
        quioscoReal: fila?.quioscoReal != null ? numero(fila.quioscoReal) : quiosco,
        almacenReal: fila?.almacenReal != null ? numero(fila.almacenReal) : almacen,
        pendienteQuiosco: numero(fila?.pendienteQuiosco),
        pendienteAlmacen: numero(fila?.pendienteAlmacen),
        precio: numero(fila?.precioVentaActual),
        seVende: fila?.seVende !== false
      }
    })
    .filter(p => p.id && p.nombre)

  const desde = inicioDelDia(ahora)
  const delDia = (ventas ?? []).filter(v => !v?.anulado && ms(v?.creadoEn) >= desde)
  let importeHoy = 0
  for (const venta of delDia) importeHoy += Number(venta?.montoTotal) || 0

  const pendientes = resumenPendientes(acciones, { ahora })

  return {
    version: SNAPSHOT_VERSION,
    generadoEn: ahora,
    puestoId,
    productos,
    resumen: {
      ventasHoy: delDia.length,
      importeHoy: redondear2(importeHoy),
      pendientes: pendientes.cantidad,
      importePendiente: pendientes.importe
    }
  }
}
