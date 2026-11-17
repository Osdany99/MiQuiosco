/**
 * app/utils/voice/snapshot.js — foto del catálogo para consultas nativas (puro).
 *
 * Con la app cerrada no hay Vue ni SQLite en JS: el servicio en primer plano
 * solo puede leer un JSON. Aquí se arma esa foto con el catálogo, el stock
 * proyectado (descontando lo pendiente de revisar), el resumen del día y las
 * deudas por cliente.
 *
 * Sin dependencias: se prueba con `node --test` (tests/pendientesVoz.test.js).
 */
import { proyectarStock } from './pendientes.js'
import { resumirDeudas } from '../../../shared/voz/deudas.js'
import { inicioDelDia, resumirDia } from '../../../shared/voz/dia.js'

export const SNAPSHOT_VERSION = 4

// El resumen del día se calcula en `shared/voz/dia.js`: la app abierta y el
// servicio nativo tienen que decir exactamente lo mismo.
export { inicioDelDia }

function redondear2(valor) {
  return Math.round((Number(valor) || 0) * 100) / 100
}

/** Número tolerante: null/undefined/no numérico cuentan como 0. */
function numero(valor) {
  const n = Number(valor)
  return Number.isFinite(n) ? n : 0
}

/**
 * @param {object} opciones
 * @param {string|null} opciones.puestoId
 * @param {Array} opciones.filas Catálogo de `cargarSaldos()`.
 * @param {Array} opciones.acciones Acciones pendientes de revisión.
 * @param {Array} opciones.ventas Ventas directas (para el resumen del día).
 * @param {Array} opciones.cuentas Cuentas fiado (para las consultas de deuda).
 * @param {Array} opciones.clientes Clientes del puesto (nombres de las deudas).
 * @param {number} opciones.ahora
 */
export function construirSnapshot({
  puestoId = null,
  filas = [],
  acciones = [],
  ventas = [],
  cuentas = [],
  clientes = [],
  ahora = Date.now()
} = {}) {
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

  const dia = resumirDia({ ventas, acciones, ahora })
  const deudas = resumirDeudas({ cuentas, clientes })

  // Lista para emparejar al cliente de un fiado dictado con la app cerrada.
  // Va aparte de `deudas` porque también hacen falta los clientes sin saldo.
  const clientesVoz = (clientes ?? [])
    .filter(c => c && c.id && !c.esCentinela)
    .map(c => ({ id: String(c.id), nombre: String(c.nombre ?? '').trim() }))
    .filter(c => c.id && c.nombre)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    .slice(0, 1000)

  return {
    version: SNAPSHOT_VERSION,
    generadoEn: ahora,
    puestoId,
    productos,
    deudas,
    clientes: clientesVoz,
    resumen: {
      ventasHoy: dia.ventasHoy,
      importeHoy: redondear2(dia.importeHoy),
      gananciaHoy: redondear2(dia.gananciaHoy),
      pendientes: dia.pendientes,
      importePendiente: redondear2(dia.importePendiente)
    }
  }
}
