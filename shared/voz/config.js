/**
 * shared/voz/config.js — configuración de flota de la voz (puro).
 *
 * La fija el super_admin desde `/admin/voz-configuracion` y la aplican todos
 * los equipos al sincronizar. Los equipos guardan una copia en Preferences
 * para seguir funcionando sin red; si nunca han sincronizado, usan estos
 * valores por defecto.
 *
 * Sin Vue, sin Capacitor y sin base de datos: se prueba con `node --test`.
 */

export const VOZ_WAKE_DEFECTO = 'oye nova'
export const VOZ_MOTOR_DEFECTO = 'auto'
export const VOZ_IDIOMA_DEFECTO = 'sistema'
export const VOZ_RETENCION_DEFECTO = 30

export const VOZ_RETENCION_MIN = 7
export const VOZ_RETENCION_MAX = 365
export const VOZ_WAKE_MAX = 40

/**
 * Motores de flota. `auto` es el recomendado:
 * - app abierta: Google si hay red, Vosk si no;
 * - app cerrada: Vosk, porque el reconocedor del sistema pita en cada frase.
 */
export const MOTORES_FLOTA = [
  {
    id: 'auto',
    label: 'Automático (recomendado)',
    detalle: 'Google con la app abierta y red; Vosk con la app cerrada.'
  },
  {
    id: 'vosk',
    label: 'Vosk',
    detalle: 'Siempre offline y silencioso. Más lento, pero no gasta datos.'
  },
  {
    id: 'google',
    label: 'Google',
    detalle: 'Siempre online. Con la app cerrada puede pitar en cada frase.'
  }
]

export const IDIOMAS_FLOTA = [
  {
    id: 'sistema',
    label: 'Sistema (recomendado)',
    detalle: 'Usa el idioma del teléfono; si no es español, cae a es-US.'
  },
  { id: 'es-US', label: 'Español (EE.UU.)', detalle: '' },
  { id: 'es-ES', label: 'Español (España)', detalle: '' },
  { id: 'es-419', label: 'Español (Latinoamérica)', detalle: '' }
]

export const MOTORES_VOZ = MOTORES_FLOTA.map(o => o.id)
export const IDIOMAS_VOZ_FLOTA = IDIOMAS_FLOTA.map(o => o.id)

export const VOZ_CONFIG_DEFECTO = Object.freeze({
  wake: VOZ_WAKE_DEFECTO,
  motor: VOZ_MOTOR_DEFECTO,
  idioma: VOZ_IDIOMA_DEFECTO,
  retencionDias: VOZ_RETENCION_DEFECTO,
  version: 0,
  actualizadoEn: null
})

/** Minúsculas, sin espacios repetidos y sin puntuación de los extremos. */
export function normalizarWake(valor) {
  return String(valor ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^[.,;:!¡¿?"']+|[.,;:!¡¿?"']+$/g, '')
    .slice(0, VOZ_WAKE_MAX)
}

/** Una palabra clave de una sola palabra dispara con conversaciones de fondo. */
export function esWakeValido(valor) {
  const wake = normalizarWake(valor)
  if (!wake) return false
  if (!/^[a-záéíóúüñ ]+$/u.test(wake)) return false
  return wake.split(' ').filter(Boolean).length >= 2
}

function numeroEntero(valor, porDefecto) {
  const n = Math.trunc(Number(valor))
  return Number.isFinite(n) ? n : porDefecto
}

/** Rellena huecos y recorta valores fuera de rango. Nunca lanza. */
export function normalizarVozConfig(raw) {
  const datos = raw && typeof raw === 'object' ? raw : {}
  const wake = esWakeValido(datos.wake) ? normalizarWake(datos.wake) : VOZ_WAKE_DEFECTO
  const motor = MOTORES_VOZ.includes(datos.motor) ? datos.motor : VOZ_MOTOR_DEFECTO
  const idioma = IDIOMAS_VOZ_FLOTA.includes(datos.idioma) ? datos.idioma : VOZ_IDIOMA_DEFECTO
  const retencionDias = Math.min(
    VOZ_RETENCION_MAX,
    Math.max(
      VOZ_RETENCION_MIN,
      numeroEntero(datos.retencionDias, VOZ_RETENCION_DEFECTO)
    )
  )
  const version = Math.max(0, numeroEntero(datos.version, 0))
  const actualizadoEn = datos.actualizadoEn
    ? String(datos.actualizadoEn)
    : null

  return {
    wake: wake || VOZ_WAKE_DEFECTO,
    motor,
    idioma,
    retencionDias,
    version,
    actualizadoEn
  }
}

/** Preferencia que entiende el dock de la app abierta. */
export function motorParaApp(motor) {
  if (motor === 'vosk') return 'vosk'
  if (motor === 'google') return 'google'
  return 'automatico'
}

/** Preferencia que entiende el selector de idioma del dock. */
export function idiomaParaApp(idioma) {
  return IDIOMAS_VOZ_FLOTA.includes(idioma) ? idioma : VOZ_IDIOMA_DEFECTO
}

/**
 * Motor efectivo en el servicio con la app cerrada. Vive aquí para que la
 * regla esté documentada en un solo sitio (el nativo la replica con los mismos
 * valores: `sistema` o `vosk`).
 */
export function motorParaServicio(motor) {
  return motor === 'google' ? 'sistema' : 'vosk'
}
