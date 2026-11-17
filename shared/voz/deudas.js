/**
 * shared/voz/deudas.js — consultas de deudas por voz (puro).
 *
 * El mismo cálculo sirve en los dos lados:
 * - app abierta: `useVentaPorVoz` resume las cuentas fiado del puesto;
 * - app cerrada: `snapshot.json` lleva este resumen y el servicio nativo solo
 *   lo lee (nunca calcula saldos por su cuenta).
 *
 * Sin Vue, sin Capacitor y sin base de datos: se prueba con `node --test`.
 */
import { clientesSimilares, normalizarNombre } from '../clientes.js'

/** Un nombre mal oído no debe elegir al cliente equivocado. */
export const UMBRAL_CLIENTE_DEUDA = 0.72

/** Tope de clientes en el resumen: el snapshot es un fichero, no una tabla. */
export const MAXIMO_CLIENTES_DEUDA = 300

/** Máximo de parecidos que se leen en voz alta. */
export const MAXIMO_PARECIDOS_DEUDA = 3

function redondear2(valor) {
  return Math.round((Number(valor) || 0) * 100) / 100
}

/** Importe para leer en voz alta: "350" o "350,50" (coma decimal, como se habla). */
export function montoDeuda(valor) {
  const n = redondear2(valor)
  if (!Number.isFinite(n)) return '0'
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace('.', ',')
}

/**
 * Deuda por cliente, de mayor a menor saldo.
 *
 * Solo entran las cuentas con saldo pendiente (`montoTotal - montoPagado > 0`):
 * una deuda saldada no se lee como deuda. `cantidad` es el total real de
 * clientes con deuda; `clientes` viene recortado a `limite` por tamaño.
 *
 * @param {object} opciones
 * @param {Array} opciones.cuentas Cuentas fiado (`cuentas_fiado`).
 * @param {Array} opciones.clientes Clientes del puesto (`clientes`).
 * @param {number} [opciones.limite]
 */
export function resumirDeudas({ cuentas = [], clientes = [], limite = MAXIMO_CLIENTES_DEUDA } = {}) {
  const porCliente = new Map()
  for (const cuenta of cuentas ?? []) {
    if (!cuenta) continue
    const saldo = redondear2((Number(cuenta.montoTotal) || 0) - (Number(cuenta.montoPagado) || 0))
    if (!(saldo > 0)) continue
    const id = String(cuenta.clienteId ?? '')
    const acumulado = porCliente.get(id) ?? { id, saldo: 0, cuentas: 0 }
    acumulado.saldo = redondear2(acumulado.saldo + saldo)
    acumulado.cuentas += 1
    porCliente.set(id, acumulado)
  }

  const nombrePorId = new Map((clientes ?? []).map(c => [String(c?.id ?? ''), c]))

  const filas = [...porCliente.values()]
    .map(fila => ({
      id: fila.id,
      nombre: String(nombrePorId.get(fila.id)?.nombre ?? '').trim() || 'Cliente sin nombre',
      saldo: fila.saldo,
      cuentas: fila.cuentas
    }))
    .filter(fila => fila.saldo > 0)
    .sort((a, b) => b.saldo - a.saldo || a.nombre.localeCompare(b.nombre, 'es'))

  const visibles = Number.isFinite(Number(limite)) && Number(limite) > 0
    ? filas.slice(0, Math.trunc(Number(limite)))
    : filas

  return {
    total: redondear2(filas.reduce((suma, fila) => suma + fila.saldo, 0)),
    cantidad: filas.length,
    clientes: visibles
  }
}

/**
 * Primer nombre (normalizado) de un cliente: «Juan Pérez» → «juan».
 */
function primerNombre(nombre) {
  return normalizarNombre(nombre).split(' ')[0] ?? ''
}

/**
 * Busca el cliente nombrado en el resumen de deudas.
 *
 * Devuelve uno de:
 * - `{ tipo: 'total' }` — no se dijo nombre;
 * - `{ tipo: 'cliente', cliente }` — coincidencia clara;
 * - `{ tipo: 'ambiguo', candidatos }` — varios parecidos: se leen y se pide
 *   el nombre completo (nunca se elige por su cuenta);
 * - `{ tipo: 'inexistente', nombre }` — ningún cliente con deuda se parece.
 *
 * «Juan» con «Juanita» y «Juan Pérez» en la lista es ambiguo aunque el
 * parecido de uno sea mayor: el nombre de pila no distingue personas.
 */
export function buscarClienteDeuda(hint, resumen, {
  umbral = UMBRAL_CLIENTE_DEUDA,
  margen = 0.05
} = {}) {
  const buscado = normalizarNombre(hint)
  if (!buscado) return { tipo: 'total' }

  const clientes = resumen?.clientes ?? []
  const parecidos = clientesSimilares(buscado, clientes, { umbral })
    .slice(0, MAXIMO_PARECIDOS_DEUDA)
  if (!parecidos.length) return { tipo: 'inexistente', nombre: String(hint ?? '').trim() }

  const mismoNombreDePila = buscado.includes(' ')
    ? []
    : clientes.filter(c => primerNombre(c.nombre).startsWith(buscado))

  const [mejor, segundo] = parecidos
  const ambiguo = mismoNombreDePila.length >= 2
    || (segundo && mejor.similitud - segundo.similitud < margen)
  if (ambiguo) {
    const candidatos = (mismoNombreDePila.length >= 2
      ? mismoNombreDePila
      : parecidos.map(x => x.cliente)
    ).slice(0, MAXIMO_PARECIDOS_DEUDA)
    return { tipo: 'ambiguo', candidatos }
  }
  return { tipo: 'cliente', cliente: mejor.cliente }
}

function fraseDeudaCliente(cliente) {
  const cuentas = Math.trunc(Number(cliente?.cuentas) || 0)
  const monto = `${montoDeuda(cliente?.saldo)} pesos`
  if (cuentas <= 1) return `${cliente?.nombre} debe ${monto}.`
  return `${cliente?.nombre} debe ${monto} en ${cuentas} deudas.`
}

function listarParecidos(candidatos) {
  return candidatos
    .map(c => `${c.nombre} debe ${montoDeuda(c.saldo)} pesos`)
    .join('; ')
}

/**
 * Reparte un cobro entre las deudas de un cliente: **la más antigua primero**.
 *
 * Devuelve `pagos` (cuenta + monto) y `aplicado`. Si `sobrante > 0`, se pidió
 * cobrar más de lo que debe y el llamador debe rechazarlo, no aplicar el resto.
 *
 * @param {Array} cuentas Cuentas con `id`, `creadoEn` y `saldoPendiente`.
 * @param {number} monto Importe a cobrar.
 */
export function distribuirCobro(cuentas = [], monto = 0) {
  const objetivo = redondear2(Math.max(0, Number(monto) || 0))
  let restante = objetivo
  const orden = [...(cuentas ?? [])].sort((a, b) => (Number(a?.creadoEn) || 0) - (Number(b?.creadoEn) || 0))

  const pagos = []
  for (const cuenta of orden) {
    if (restante <= 0) break
    const saldo = redondear2(cuenta?.saldoPendiente
      ?? ((Number(cuenta?.montoTotal) || 0) - (Number(cuenta?.montoPagado) || 0)))
    if (!(saldo > 0)) continue
    const aplicar = Math.min(saldo, restante)
    if (!(aplicar > 0)) continue
    pagos.push({ cuentaId: cuenta.id, monto: redondear2(aplicar) })
    restante = redondear2(restante - aplicar)
  }

  return {
    pagos,
    aplicado: redondear2(objetivo - restante),
    sobrante: restante
  }
}

/** Saldo pendiente total de un conjunto de cuentas. */
export function saldoTotalDeudas(cuentas = []) {
  return redondear2((cuentas ?? []).reduce((suma, c) => {
    const saldo = c?.saldoPendiente ?? ((Number(c?.montoTotal) || 0) - (Number(c?.montoPagado) || 0))
    return suma + Math.max(0, Number(saldo) || 0)
  }, 0))
}

/**
 * Respuesta hablada (y su versión escrita) para una consulta de deudas.
 *
 * @param {object} resumen Salida de `resumirDeudas`.
 * @param {object} encontrado Salida de `buscarClienteDeuda`.
 * @param {'cliente'|'total'|'mayor'} [ambito]
 */
export function formatearDeuda(resumen, encontrado, ambito = 'total') {
  const total = montoDeuda(resumen?.total)
  const cantidad = Math.trunc(Number(resumen?.cantidad) || 0)
  const mayor = resumen?.clientes?.[0] ?? null

  if (encontrado?.tipo === 'ambiguo') {
    const candidatos = encontrado.candidatos ?? []
    return {
      tipo: 'ambiguo',
      titulo: `${candidatos.length} clientes parecidos`,
      descripcion: listarParecidos(candidatos),
      habla: `Tengo ${candidatos.length} clientes parecidos: ${listarParecidos(candidatos)}. Di el nombre completo.`
    }
  }

  if (encontrado?.tipo === 'cliente' && encontrado.cliente) {
    return {
      tipo: 'cliente',
      titulo: `${encontrado.cliente.nombre}: ${montoDeuda(encontrado.cliente.saldo)} pesos`,
      descripcion: `Saldo pendiente de ${encontrado.cliente.nombre}`,
      habla: fraseDeudaCliente(encontrado.cliente)
    }
  }

  if (encontrado?.tipo === 'inexistente') {
    const nombre = encontrado.nombre || 'ese cliente'
    return {
      tipo: 'sin_deuda',
      titulo: `Sin deudas: ${nombre}`,
      descripcion: `${nombre} no aparece con saldo pendiente`,
      habla: `No tengo deudas pendientes de ${nombre}.`
    }
  }

  if (!cantidad || !mayor) {
    return {
      tipo: 'sin_deudas',
      titulo: 'Deudas pendientes: ninguna',
      descripcion: 'No hay cuentas fiadas con saldo',
      habla: 'No hay deudas pendientes.'
    }
  }

  const resumenTotal = `En total me deben ${total} pesos entre ${cantidad} ${cantidad === 1 ? 'cliente' : 'clientes'}.`

  if (ambito === 'mayor') {
    return {
      tipo: 'mayor',
      titulo: `El que más debe: ${mayor.nombre} (${montoDeuda(mayor.saldo)} pesos)`,
      descripcion: `${total} pesos entre ${cantidad} clientes`,
      habla: `El que más debe es ${mayor.nombre}, con ${montoDeuda(mayor.saldo)} pesos. ${resumenTotal}`
    }
  }

  return {
    tipo: 'total',
    titulo: `Me deben ${total} pesos`,
    descripcion: `${cantidad} ${cantidad === 1 ? 'cliente' : 'clientes'} con saldo · el que más debe: ${mayor.nombre} (${montoDeuda(mayor.saldo)})`,
    habla: `${resumenTotal} El que más debe es ${mayor.nombre}, con ${montoDeuda(mayor.saldo)} pesos.`
  }
}
