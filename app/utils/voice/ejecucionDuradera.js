/**
 * Seguimiento recuperable de escrituras directas de voz.
 *
 * Un plan guarda los IDs y el payload antes de llamar al dominio. Cada paso pasa
 * por `pendiente → ejecutando → aplicado`; si el proceso muere o se pierde la
 * respuesta, el siguiente intento consulta ese mismo ID antes de ejecutar.
 * Nunca se reintenta a ciegas una operación cuyo resultado siga siendo incierto.
 */

function clonar(valor) {
  return JSON.parse(JSON.stringify(valor))
}

function redondear2(valor) {
  return Math.round((Number(valor) || 0) * 100) / 100
}

/** Huella determinista: el orden de las claves no cambia la operación. */
export function huellaOperacion(valor) {
  function normalizar(v) {
    if (Array.isArray(v)) return v.map(normalizar)
    if (!v || typeof v !== 'object') return v ?? null
    return Object.fromEntries(
      Object.keys(v).sort().map(k => [k, normalizar(v[k])])
    )
  }
  return JSON.stringify(normalizar(valor))
}

export function crearPlanOperacion({
  id,
  tipo,
  modo,
  puestoId,
  usuarioId,
  recuperacion,
  pasos,
  detalle = {},
  ahora = Date.now()
}) {
  if (!String(id ?? '').trim()) throw new Error('El plan necesita un commandId.')
  if (!String(tipo ?? '').trim()) throw new Error('El plan necesita un tipo.')
  if (!['online', 'local'].includes(modo)) throw new Error('El plan necesita el modo de origen.')
  if (!String(puestoId ?? '').trim() || !String(usuarioId ?? '').trim()) {
    throw new Error('El plan necesita usuario y puesto.')
  }
  if (!Array.isArray(pasos) || !pasos.length) throw new Error('El plan no tiene operaciones.')
  for (const paso of pasos) {
    if (!String(paso?.id ?? '').trim() || !String(paso?.tipo ?? '').trim() || !paso?.datos) {
      throw new Error('Cada paso necesita id, tipo y payload.')
    }
  }

  return {
    version: 1,
    id: String(id),
    tipo: String(tipo),
    modo,
    puestoId: String(puestoId),
    usuarioId: String(usuarioId),
    clienteId: typeof recuperacion === 'object' && recuperacion?.clienteId ? String(recuperacion.clienteId) : null,
    recuperacion: typeof recuperacion === 'string' ? recuperacion : huellaOperacion(recuperacion),
    detalle: clonar(detalle),
    estado: 'pendiente',
    pasos: pasos.map(paso => ({
      id: String(paso.id),
      tipo: String(paso.tipo),
      datos: clonar(paso.datos),
      monto: paso.monto == null ? null : redondear2(paso.monto),
      estado: 'pendiente'
    })),
    creadoEn: Number(ahora) || Date.now(),
    actualizadoEn: Number(ahora) || Date.now()
  }
}

/** Total ya aplicado, no el total que se pretendía cobrar. */
export function montoAplicado(plan) {
  return redondear2((plan?.pasos ?? [])
    .filter(paso => paso.estado === 'aplicado')
    .reduce((total, paso) => total + (Number(paso.monto) || 0), 0))
}

/** Solo los fallos de transporte marcan resultado incierto. */
export function esResultadoIncertivo(error) {
  return Boolean(error?.timeout === true || error?.red === true)
}

async function comprobarPaso(paso, buscar, coincide) {
  try {
    const fila = await buscar(paso)
    if (!fila) return { estado: 'ausente' }
    return await coincide(paso, fila)
      ? { estado: 'existe', fila }
      : { estado: 'conflicto', fila }
  } catch (error) {
    return { estado: 'incierto', error }
  }
}

/**
 * Ejecuta o reanuda un plan.
 *
 * `buscar` debe propagar un fallo de lectura: ausencia solo significa "no se
 * aplicó" cuando la consulta terminó correctamente. `coincide` evita aceptar un
 * ID ocupado por otro payload como si fuera un reintento válido.
 */
export async function ejecutarPlanOperacion({
  plan: origen,
  modoActual,
  guardar,
  eliminar,
  ejecutar,
  buscar,
  coincide,
  ahora = Date.now
}) {
  const plan = clonar(origen)
  const pendientes = () => plan.pasos.filter(paso => paso.estado !== 'aplicado')
  const resultado = (estado, extra = {}) => ({
    estado,
    plan,
    aplicado: montoAplicado(plan),
    ...extra
  })

  async function persistir() {
    plan.actualizadoEn = Number(ahora()) || Date.now()
    try {
      await guardar(clonar(plan))
    } catch (error) {
      // El llamador necesita saber si ya hubo efectos aunque falle el journal.
      error.plan = clonar(plan)
      error.aplicado = montoAplicado(plan)
      throw error
    }
  }

  async function cerrar() {
    plan.estado = 'aplicado'
    await persistir()
    // Si el borrado falla queda un receipt aplicado: repetir el comando lo
    // reconcilia sin escribir y vuelve a intentar limpiarlo.
    await eliminar(plan.id).catch(() => {})
    return resultado('aplicado')
  }

  if (!pendientes().length) return cerrar()

  // Un plan online no puede reconciliarse contra la copia SQLite (ni al revés):
  // una fila ausente en otra capa no prueba que la escritura no ocurrió.
  const modoVigente = () => typeof modoActual === 'function' ? modoActual() : modoActual
  const cambioDeModo = () => Boolean(modoVigente() && plan.modo !== modoVigente())
  if (cambioDeModo()) return resultado('modo_distinto')

  for (const paso of plan.pasos) {
    if (paso.estado === 'aplicado') continue
    if (cambioDeModo()) return resultado('modo_distinto', { paso })

    // `ejecutando` o `incierto` solo aparecen tras un intento anterior. Primero
    // se reconcilia por ID; únicamente una ausencia confirmada permite reintentar.
    if (paso.estado !== 'pendiente') {
      const previa = await comprobarPaso(paso, buscar, coincide)
      if (previa.estado === 'existe') {
        paso.estado = 'aplicado'
        await persistir()
        continue
      }
      if (previa.estado === 'conflicto') {
        plan.estado = 'revision'
        await persistir()
        return resultado('conflicto', { paso, fila: previa.fila })
      }
      if (previa.estado === 'incierto') {
        plan.estado = 'incierto'
        await persistir()
        return resultado('incierto', { paso, error: previa.error })
      }
      paso.estado = 'pendiente'
    }

    paso.estado = 'ejecutando'
    plan.estado = 'ejecutando'
    // Este registro debe ser durable ANTES de tocar dinero, deuda o stock.
    await persistir()
    if (cambioDeModo()) return resultado('modo_distinto', { paso })

    let salida
    try {
      salida = await ejecutar(paso)
    } catch (error) {
      salida = { ok: false, error }
    }

    if (salida?.ok) {
      paso.estado = 'aplicado'
      await persistir()
      continue
    }

    const error = salida?.error ?? new Error('No se pudo completar la operación.')
    if (esResultadoIncertivo(error)) {
      paso.estado = 'incierto'
      plan.estado = 'incierto'
      await persistir()
      if (cambioDeModo()) return resultado('modo_distinto', { paso, error })

      const comprobacion = await comprobarPaso(paso, buscar, coincide)
      if (comprobacion.estado === 'existe') {
        paso.estado = 'aplicado'
        await persistir()
        continue
      }
      if (comprobacion.estado === 'conflicto') {
        plan.estado = 'revision'
        await persistir()
        return resultado('conflicto', { paso, error, fila: comprobacion.fila })
      }
      if (comprobacion.estado === 'incierto') {
        return resultado('incierto', { paso, error: comprobacion.error ?? error })
      }

      // La consulta terminó y no existe: este paso no se aplicó. Si ya había
      // cobros anteriores se conserva un plan parcial para continuar después.
      paso.estado = 'pendiente'
      if (montoAplicado(plan) > 0 || plan.pasos.some(p => p.estado === 'aplicado')) {
        plan.estado = 'parcial'
        await persistir()
        return resultado('pendiente', { paso, error, confirmadoNoAplicado: true })
      }
      await eliminar(plan.id).catch(() => {})
      return resultado('rechazado', { paso, error, confirmadoNoAplicado: true })
    }

    paso.estado = 'pendiente'
    if (montoAplicado(plan) > 0 || plan.pasos.some(p => p.estado === 'aplicado')) {
      plan.estado = 'parcial'
      await persistir()
      return resultado('rechazado', { paso, error })
    }

    // Nada se escribió: un error de validación no necesita seguimiento durable.
    await eliminar(plan.id).catch(() => {})
    return resultado('rechazado', { paso, error })
  }

  return cerrar()
}
