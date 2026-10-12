/**
 * app/utils/historialQuiosco.js — Datos de /historial-quiosco.
 *
 * La vista que responde "¿qué le pasó a este producto en el quiosco cada día de
 * este mes?", sin que haya que abrir un cuadre por día. Cada celda es la
 * capacidad de venta de ese día (el mismo número que sale bajo la cantidad en
 * la vista del cuadre) y lleva su desglose para el diálogo.
 *
 * Regla del switch "Vende": un producto desactivado a mitad de mes sigue
 * saliendo en ese mes, porque si se quitara de golpe las celdas de los días en
 * que sí se movió desaparecerían y el mes quedaría ilegible. Solo se va cuando
 * ya no tiene números en ningún día del mes elegido.
 */
import { capacidadDelMes } from '../../shared/inventario/capacidad'
import { diasDelMes, numeroDia, aDia } from '../../shared/inventario/analitica'
import { leerLibro } from './libro'

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const DIAS_SEMANA = ['D', 'L', 'M', 'X', 'J', 'V', 'S']

function diaDe(dia) {
  return new Date(`${dia}T12:00:00`)
}

/** '2026-03' → 'Marzo 2026' */
export function nombreMes(mes) {
  const [y, m] = String(mes ?? '').split('-').map(Number)
  if (!y || !m || m < 1 || m > 12) return ''
  return `${MESES[m - 1]} ${y}`
}

/** '2026-03' → 'Mar 2026' */
export function nombreMesCorto(mes) {
  const [y, m] = String(mes ?? '').split('-').map(Number)
  if (!y || !m || m < 1 || m > 12) return ''
  return `${MESES_CORTOS[m - 1]} ${y}`
}

/** Mes 'YYYY-MM' siguiente / anterior al dado. */
export function desplazarMes(mes, salto) {
  const [y, m] = String(mes ?? '').split('-').map(Number)
  if (!y || !m) return ''
  const total = y * 12 + (m - 1) + salto
  const nuevoY = Math.floor(total / 12)
  const nuevoM = (total % 12) + 1
  return `${nuevoY}-${String(nuevoM).padStart(2, '0')}`
}

/** Cabeceras de las columnas de día: número, nombre de día y si es el de hoy. */
export function columnasDeMes(mes) {
  const hoy = aDia(Date.now())
  return diasDelMes(mes).map(dia => ({
    dia,
    numero: dia.slice(8),
    diaSemana: DIAS_SEMANA[diaDe(dia).getDay()],
    esHoy: dia === hoy,
    esFuturo: dia > hoy
  }))
}

/**
 * Meses que tienen algo que mostrar, del más reciente al más viejo.
 *
 * Vienen de los cuadres y de los movimientos con fecha de negocio: si un mes
 * no aparece es que no pasó nada en él, y ofrecerlo sería una tabla vacía.
 */
export function mesesConDatos(lib) {
  const vistos = new Set()
  for (const c of lib.cuadres) {
    const dia = aDia(c.fecha)
    if (dia) vistos.add(dia.slice(0, 7))
  }
  for (const dia of lib.fechas.values()) {
    if (dia) vistos.add(dia.slice(0, 7))
  }
  return [...vistos].sort((a, b) => b.localeCompare(a))
}

/** El mes que toca abrir: el actual si tiene datos, si no el más reciente. */
export function mesPorDefecto(meses) {
  const actual = aDia(Date.now()).slice(0, 7)
  return meses.includes(actual) ? actual : (meses[0] ?? actual)
}

function nombrePorProducto(lib) {
  const mapa = new Map()
  for (const p of lib.productos) {
    mapa.set(p.id, {
      nombre: p.nombre ?? '—',
      descripcion: p.descripcion ?? null,
      orden: Number(p.orden ?? 0)
    })
  }
  return mapa
}

/**
 * Suma de lo vendido por producto y día, tomado de las LÍNEAS del cuadre y no
 * de los movimientos: es lo mismo que muestra la pantalla del cuadre, y además
 * funciona con el cuadre abierto, donde los movimientos todavía no existen.
 */
function vendidoPorDia(lib) {
  const diaDeCuadre = new Map()
  for (const c of lib.cuadres) {
    const dia = aDia(c.fecha)
    if (dia) diaDeCuadre.set(c.id, dia)
  }
  const mapa = new Map()
  for (const i of lib.items) {
    const dia = diaDeCuadre.get(i.cuadreId)
    if (!dia) continue
    const cantidad = Number(i.cantidad) || 0
    if (cantidad === 0) continue
    let porProducto = mapa.get(i.productoId)
    if (!porProducto) {
      porProducto = new Map()
      mapa.set(i.productoId, porProducto)
    }
    porProducto.set(dia, (porProducto.get(dia) ?? 0) + cantidad)
  }
  return mapa
}

/**
 * Filas de la tabla para un mes.
 *
 * Cada fila es un producto con sus celdas ya resueltas, más los totales que la
 * cabecera usa para resumir. La capacidad viene de capacidadDelMes(), que es la
 * misma matemática del "Q:N" del cuadre.
 *
 * @param {object} lib — el libro de leerLibro()
 * @param {string} mes — 'YYYY-MM'
 * @param {object} [filtros] — { busqueda, soloConActividad }
 */
export function filasDelMes(lib, mes, { busqueda = '', soloConActividad = false } = {}) {
  const dias = diasDelMes(mes)
  if (!dias.length) return { dias, filas: [], productosConActividad: 0 }

  const capacidad = capacidadDelMes({
    movimientos: lib.movimientos,
    cuadres: lib.cuadres,
    lotes: lib.lotes,
    traspasos: lib.traspasos,
    saldos: lib.saldos,
    desde: dias[0],
    hasta: dias[dias.length - 1]
  })

  const vendidos = vendidoPorDia(lib)
  const info = nombrePorProducto(lib)
  const primero = dias[0]
  const ultimo = dias[dias.length - 1]
  const texto = String(busqueda ?? '').trim().toLowerCase()

  const filas = []
  let productosConActividad = 0

  for (const producto of lib.productos) {
    const productoId = producto.id
    const diasProducto = capacidad.get(productoId)
    const vendidoProducto = vendidos.get(productoId)
    const datos = info.get(productoId) ?? { nombre: '—', descripcion: null, orden: 0 }
    const seVende = producto.activo !== false && producto.activoQuiosco !== false

    const celdas = new Map()
    let actividad = false
    let totalVendido = 0

    for (const dia of dias) {
      const celda = diasProducto?.get(dia)
      const capacidadDia = celda?.capacidad ?? 0
      const pasos = celda?.pasos ?? []
      const vendido = vendidoProducto?.get(dia) ?? 0
      const tieneMovimiento = pasos.length > 0
      if (tieneMovimiento || vendido > 0) actividad = true
      totalVendido += vendido
      celdas.set(dia, {
        inicial: celda?.inicial ?? 0,
        capacidad: capacidadDia,
        pasos,
        vendido,
        cuadreId: celda?.cuadreId ?? null,
        tieneMovimiento,
        // Se vendió más de lo que había: el mismo rojo que marca la línea del
        // cuadre cuando la cantidad no cuadra.
        excedido: capacidadDia - vendido < 0,
        hayCuadre: Boolean(celda?.cuadreId)
      })
    }

    if (actividad) productosConActividad++
    if (soloConActividad && !actividad) continue

    if (texto) {
      const coincide = datos.nombre.toLowerCase().includes(texto)
        || (datos.descripcion ?? '').toLowerCase().includes(texto)
      if (!coincide) continue
    }

    filas.push({
      productoId,
      nombre: datos.nombre,
      descripcion: datos.descripcion,
      orden: datos.orden,
      seVende,
      // Activo y "se vende" se guardan por separado: el switch de /productos
      // puede apagar cualquiera de los dos y el badge los distingue.
      activo: producto.activo !== false,
      activoQuiosco: producto.activoQuiosco !== false,
      actividad,
      totalVendido,
      celdas,
      // Foto del mes, para el resumen de la cabecera.
      primerDia: celdas.get(primero)?.capacidad ?? 0,
      ultimoDia: celdas.get(ultimo)?.capacidad ?? 0
    })
  }

  filas.sort((a, b) => (a.orden - b.orden) || a.nombre.localeCompare(b.nombre))
  return { dias, filas, productosConActividad }
}

/**
 * Carga (o relee del caché) el libro y arma las filas del mes.
 * Devuelve también los meses disponibles, para el selector.
 */
export async function cargarHistorialQuiosco(mes, filtros) {
  const lib = await leerLibro()
  const meses = mesesConDatos(lib)
  const mesElegido = mes || mesPorDefecto(meses)
  const { dias, filas, productosConActividad } = filasDelMes(lib, mesElegido, filtros)
  return {
    mes: mesElegido,
    dias,
    diasNumero: dias.map(d => numeroDia(d)),
    filas,
    productosConActividad,
    meses: meses.map(m => ({ value: m, label: nombreMes(m) }))
  }
}
