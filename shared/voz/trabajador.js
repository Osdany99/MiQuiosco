/**
 * Modo cuadre del trabajador (P5).
 *
 * El trabajador nunca dice «modo cuadre»: la pantalla del cuadre ES el modo.
 * Fuera de `/cuadre` la voz no hace nada, y dentro solo atiende una lista
 * blanca: fiar, deuda de dinero, transferencia, ayuda y repetir. Cobrar,
 * consultas de stock/precio, venta directa, entradas, traspasos, cambios de
 * precio, mover producto, altas y abrir/cerrar cuadre quedan para el jefe.
 *
 * Módulo puro: no toca Vue ni el repositorio, para poder probarlo con node.
 */
export const COMANDOS_TRABAJADOR = Object.freeze([
  'venta_fiada',
  'deuda_dinero',
  'transferencia_cuadre',
  'ayuda',
  'repetir'
])

export const FRASE_TRABAJADOR = 'En el cuadre puedes fiar, anotar deudas de dinero y registrar transferencias. También «repite» y «ayuda».'

export const FRASE_FUERA_CUADRE = 'La voz del trabajador solo funciona en el cuadre. Abre la pantalla del cuadre.'

/** ¿La ruta es la pantalla del cuadre? `/cuadres` (historial) no cuenta. */
export function esRutaCuadre(ruta) {
  const r = String(ruta ?? '')
  return r === '/cuadre' || r.startsWith('/cuadre/')
}

/** ¿El comando está en la lista blanca del trabajador? */
export function comandoPermitidoTrabajador(comando) {
  return COMANDOS_TRABAJADOR.includes(String(comando ?? ''))
}

/**
 * Filtro puro del trabajador. Devuelve `null` cuando el flujo sigue normal
 * (jefe, o trabajador dentro del cuadre con un comando permitido) o la acción
 * de aviso que debe ejecutarse.
 */
export function evaluarTrabajador({ esTrabajador, ruta, comando } = {}) {
  if (!esTrabajador) return null
  if (!esRutaCuadre(ruta)) {
    return { tipo: 'aviso', motivo: 'trabajador_fuera_cuadre', mensaje: FRASE_FUERA_CUADRE }
  }
  if (!comandoPermitidoTrabajador(comando)) {
    return { tipo: 'aviso', motivo: 'trabajador_comando_no_permitido', mensaje: FRASE_TRABAJADOR }
  }
  return null
}
