/**
 * app/utils/voice/buzon.js — buzón nativo de dictados (puro).
 *
 * Con la app cerrada, el servicio en primer plano solo puede escuchar y dejar
 * el texto en un fichero. Aquí vive lo que no necesita Android ni Vue: leer y
 * validar esa entrada y convertir la interpretación en una acción pendiente.
 *
 * El servicio NUNCA decide qué se vende: escribe la transcripción y ya. Quien
 * interpreta es el mismo resolvedor de la app abierta, al abrir la app.
 *
 * Sin dependencias: se prueba con `node --test` (tests/buzonVoz.test.js).
 */

import { motorDeServicio } from '../../../shared/voz/motoresStt.js'

export const TIPOS_VENTA_BUZON = ['directa', 'casa', 'familiar', 'regalo']

function entero(valor) {
  const n = Math.trunc(Number(valor) || 0)
  return n > 0 ? n : 1
}

function monto(valor) {
  return Math.round((Number(valor) || 0) * 100) / 100
}

/**
 * Valida la entrada que dejó el servicio. Devuelve `null` si no hay texto o
 * fecha: una entrada sin transcripción no se puede auditar ni revisar.
 *
 * Formato tolerado (el servicio nativo puede evolucionar sin romper la app):
 *   { id, texto, confidence, alternativas, dictadoEn, ubicacion }
 */
export function normalizarEntradaBuzon(datos) {
  if (!datos || typeof datos !== 'object') return null
  const texto = String(datos.texto ?? '').trim()
  if (!texto) return null
  const dictadoEn = Number(datos.dictadoEn ?? datos.t ?? datos.creadoEn) || 0
  if (!dictadoEn) return null

  const alternativas = Array.isArray(datos.alternativas)
    ? datos.alternativas
        .map((a) => {
          const texto = typeof a === 'string' ? a : (a?.texto ?? a?.text ?? '')
          const confidence = typeof a === 'object' ? Number(a?.confidence ?? a?.confianza ?? 0) : 0
          return { texto: String(texto ?? '').trim(), confidence: confidence || 0 }
        })
        .filter(a => a.texto)
    : []

  return {
    origenId: String(datos.id ?? datos.origenId ?? '').trim() || null,
    texto,
    sttConfidence: Number(datos.confidence ?? datos.sttConfidence ?? 0) || 0,
    alternativas,
    dictadoEn,
    ubicacion: datos.ubicacion === 'almacen'
      ? 'almacen'
      : (datos.ubicacion === 'quiosco' ? 'quiosco' : null),
    // El servicio escribe `sistema`/`vosk`; se normaliza al nombre del panel.
    motor: motorDeServicio(datos.motor)
  }
}

/**
 * Entrada YA RESUELTA por el servicio: producto, cantidad y precio decididos y
 * confirmados por voz (`resuelto: true`). No hay que reinterpretar nada; sólo
 * validar y convertirla en el documento de `crear()`.
 *
 * Es el camino normal desde que el servicio dialoga como la app abierta. El
 * camino antiguo (`normalizarEntradaBuzon` + `resolver()`) queda para ficheros
 * viejos o para un servicio sin diálogo.
 */
export function pendienteResuelto(datos) {
  if (!datos || datos.resuelto !== true) return null
  const texto = String(datos.texto ?? '').trim()
  if (!texto) return null

  // Cobro dictado con la app cerrada: no lleva producto, lleva la deuda que se
  // paga. Un pago por entrada (el servicio reparte FIFO antes de escribir).
  if (datos.tipo === 'cobro') {
    const cuentaFiadoId = String(datos.cuentaFiadoId ?? '').trim()
    const clienteId = String(datos.clienteId ?? '').trim()
    const montoCobro = monto(datos.monto ?? datos.importe)
    if (!cuentaFiadoId || !clienteId || !(montoCobro > 0)) return null
    return {
      origenId: String(datos.id ?? datos.origenId ?? '').trim() || null,
      texto,
      sttConfidence: Number(datos.confidence) || 0,
      dictadoEn: Number(datos.dictadoEn) || Date.now(),
      origen: 'servicio',
      motor: motorDeServicio(datos.motor),
      tipo: 'cobro',
      productoId: null,
      productoNombre: null,
      ubicacion: datos.ubicacion === 'quiosco' ? 'quiosco' : 'almacen',
      tipoVenta: 'directa',
      cantidad: 1,
      precioUnitario: montoCobro,
      importe: montoCobro,
      clienteId,
      cuentaFiadoId,
      formaPago: datos.formaPago === 'transferencia' ? 'transferencia' : 'efectivo',
      motivo: null
    }
  }

  const productoId = String(datos.productoId ?? '').trim()
  if (!productoId) return null

  const cantidad = entero(datos.cantidad)
  // El servicio nativo manda el precio de catálogo; para casa y familiar el
  // precio es el costo y para regalo no se cobra. El importe se recalcula para
  // que la revisión no muestre (ni registre) el precio de venta normal.
  const tipoVenta = TIPOS_VENTA_BUZON.includes(datos.tipoVenta) ? datos.tipoVenta : 'directa'
  const esCosto = tipoVenta === 'casa' || tipoVenta === 'familiar'
  const precioUnitario = tipoVenta === 'regalo'
    ? 0
    : esCosto
      ? monto(datos.costoUnitario)
      : monto(datos.precioUnitario)
  const importe = monto(precioUnitario * cantidad)

  // Fiado dictado con la app cerrada: además del producto hace falta el
  // cliente. Sin cliente no se puede crear la deuda y se descarta la entrada.
  const esDeuda = datos.tipo === 'deuda'
  const clienteId = esDeuda ? String(datos.clienteId ?? '').trim() : ''
  if (esDeuda && !clienteId) return null

  return {
    origenId: String(datos.id ?? datos.origenId ?? '').trim() || null,
    texto,
    sttConfidence: Number(datos.confidence) || 0,
    dictadoEn: Number(datos.dictadoEn) || Date.now(),
    origen: 'servicio',
    motor: motorDeServicio(datos.motor),
    tipo: esDeuda ? 'deuda' : 'venta',
    productoId,
    productoNombre: datos.productoNombre ? String(datos.productoNombre) : null,
    ubicacion: datos.ubicacion === 'almacen' ? 'almacen' : 'quiosco',
    tipoVenta: TIPOS_VENTA_BUZON.includes(datos.tipoVenta) ? datos.tipoVenta : 'directa',
    cantidad,
    precioUnitario,
    importe,
    clienteId: clienteId || null,
    // Ya se decidió el stock y se confirmó por voz: no viene "dudosa".
    motivo: null
  }
}

function base(entrada) {
  return {
    origenId: entrada?.origenId ?? null,
    texto: String(entrada?.texto ?? ''),
    sttConfidence: Number(entrada?.sttConfidence) || 0,
    dictadoEn: Number(entrada?.dictadoEn) || Date.now(),
    origen: 'servicio',
    motor: entrada?.motor ?? null
  }
}

/**
 * Convierte una acción del resolvedor en el documento de `crear()`.
 *
 * Devuelve `null` para lo que no es un movimiento de datos: navegación y
 * consultas ya se responden al momento y no deben ensuciar la revisión.
 */
export function pendienteDesdeAccion(accion, entrada) {
  if (!accion || !entrada) return null
  if (accion.tipo === 'cancelado' || accion.tipo === 'navegacion' || accion.tipo === 'consultar_stock') {
    return null
  }

  // Los comandos asistidos (K, L, M, N, P4, P5) necesitan el formulario delante
  // o un «sí» con pantalla: si un dictado llegara hasta aquí, se ignora en vez
  // de anotarse como venta.
  if (accion.tipo === 'entrada' || accion.tipo === 'cambio_precio' || accion.tipo === 'traspaso' || accion.tipo === 'cuadre'
    || accion.tipo === 'ajuste' || accion.tipo === 'producto_alta' || accion.tipo === 'deuda_dinero'
    || accion.tipo === 'transferencia_cuadre') {
    return null
  }

  const comun = base(entrada)

  if (accion.tipo === 'cobrar') {
    // Camino antiguo (sin diálogo nativo): se guarda el primer pago del reparto.
    const pago = accion.pagos?.[0]
    if (!pago) return null
    return {
      ...comun,
      tipo: 'cobro',
      productoId: null,
      productoNombre: null,
      ubicacion: 'almacen',
      tipoVenta: 'directa',
      cantidad: 1,
      precioUnitario: monto(pago.monto),
      importe: monto(pago.monto),
      clienteId: accion.cliente?.id ?? null,
      cuentaFiadoId: pago.cuentaId,
      formaPago: accion.formaPago === 'transferencia' ? 'transferencia' : 'efectivo',
      motivo: null
    }
  }

  if (accion.tipo === 'fiar') {
    const fila = accion.fila ?? {}
    const cantidad = entero(accion.cantidad ?? accion.slots?.cantidad)
    // El precio dictado («fía 2 panes a Juan a 15») manda sobre el del catálogo.
    const precioUnitario = accion.slots?.precioUnitario != null
      ? monto(accion.slots.precioUnitario)
      : monto(fila.precioVentaActual)
    return {
      ...comun,
      tipo: 'deuda',
      productoId: fila.productoId ?? null,
      productoNombre: fila.nombre ?? null,
      ubicacion: accion.destino?.ubicacion ?? entrada.ubicacion ?? 'almacen',
      tipoVenta: 'directa',
      cantidad,
      precioUnitario,
      importe: accion.importe != null ? monto(accion.importe) : monto(precioUnitario * cantidad),
      clienteId: accion.cliente?.id ?? accion.slots?.clienteId ?? null,
      motivo: null
    }
  }

  if (accion.tipo === 'venta' || accion.tipo === 'stock') {
    const fila = accion.fila ?? {}
    const cantidad = entero(accion.cantidad)
    const tipoVenta = TIPOS_VENTA_BUZON.includes(accion.slots?.tipoVenta)
      ? accion.slots.tipoVenta
      : 'directa'
    const esCosto = tipoVenta === 'casa' || tipoVenta === 'familiar'
    const precioUnitario = tipoVenta === 'regalo'
      ? 0
      : accion.precioUnitario != null
        ? monto(accion.precioUnitario)
        : esCosto ? monto(fila.costoActual) : monto(fila.precioVentaActual)
    return {
      ...comun,
      productoId: fila.productoId ?? null,
      productoNombre: fila.nombre ?? null,
      ubicacion: accion.destino?.ubicacion ?? entrada.ubicacion ?? 'quiosco',
      tipoVenta,
      cantidad,
      precioUnitario,
      importe: monto(precioUnitario * cantidad),
      clienteId: accion.slots?.clienteId ?? null,
      // La falta de stock no la resuelve el servicio: se deja anotada para que
      // el jefe decida (reponer, editar cantidad o descartar).
      motivo: accion.tipo === 'stock' ? 'stock_insuficiente' : null
    }
  }

  if (accion.tipo === 'ambiguo') {
    // Se propone el mejor candidato, no se decide: la fila queda marcada y el
    // jefe confirma en pantalla después de leer el dictado.
    const fila = accion.candidatos?.[0]?.row ?? {}
    const cantidad = entero(accion.slots?.cantidad)
    const precioUnitario = monto(fila.precioVentaActual)
    return {
      ...comun,
      productoId: fila.productoId ?? null,
      productoNombre: fila.nombre ?? null,
      ubicacion: entrada.ubicacion ?? 'quiosco',
      tipoVenta: TIPOS_VENTA_BUZON.includes(accion.slots?.tipoVenta)
        ? accion.slots.tipoVenta
        : 'directa',
      cantidad,
      precioUnitario,
      importe: monto(precioUnitario * cantidad),
      clienteId: accion.slots?.clienteId ?? null,
      motivo: 'interpretacion_dudosa'
    }
  }

  if (accion.tipo === 'aviso') {
    return {
      ...comun,
      productoId: null,
      productoNombre: null,
      ubicacion: accion.ubicacion === 'almacen' ? 'almacen' : 'quiosco',
      tipoVenta: 'directa',
      cantidad: 1,
      precioUnitario: 0,
      importe: 0,
      clienteId: null,
      motivo: accion.motivo ?? 'aviso'
    }
  }

  // error (producto no encontrado): se guarda lo dicho para que no se pierda el
  // dictado; sin producto no se puede aplicar, solo descartar.
  return {
    ...comun,
    productoId: null,
    productoNombre: accion.texto || null,
    ubicacion: entrada.ubicacion ?? 'quiosco',
    tipoVenta: 'directa',
    cantidad: 1,
    precioUnitario: 0,
    importe: 0,
    clienteId: null,
    motivo: accion.motivo ?? 'producto_no_encontrado'
  }
}
