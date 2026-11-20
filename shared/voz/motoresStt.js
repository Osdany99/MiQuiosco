/**
 * shared/voz/motoresStt.js — qué motor transcribió un dictado (puro).
 *
 * Se guarda con cada acierto para poder responder «¿esto lo entendió Vosk o
 * Google?» desde el panel del super_admin. Los valores son estables: no
 * cambiarlos sin migración (`voz_aciertos.motor`).
 */

export const MOTORES_STT = ['vosk', 'google-offline', 'google-online', 'web']

export const ETIQUETAS_MOTOR_STT = {
  'vosk': 'Vosk (offline)',
  'google-offline': 'Google (sin conexión)',
  'google-online': 'Google (en línea)',
  'web': 'Navegador'
}

/** Normaliza lo que llegue de la BD o de una entrada vieja del buzón. */
export function normalizarMotorStt(valor) {
  const texto = String(valor ?? '').trim()
  return MOTORES_STT.includes(texto) ? texto : null
}

/**
 * Motor con el que dictó el dock: `motorVoz` es el catálogo del cliente
 * (`google` | `vosk` | `web`) y `modo` el online/offline resuelto.
 */
export function motorEfectivo({ motorVoz = null, modo = null, backend = null } = {}) {
  const id = String(motorVoz ?? '').trim()
  if (id === 'vosk') return 'vosk'
  if (id === 'google') return modo === 'offline' ? 'google-offline' : 'google-online'
  if (id === 'web' || backend === 'web') return 'web'
  return null
}

/**
 * Motor del servicio en primer plano: el nativo solo distingue `vosk` y
 * `sistema`, y su reconocedor del sistema va siempre online
 * (`EXTRA_PREFER_OFFLINE = false`).
 */
export function motorDeServicio(valor) {
  const id = String(valor ?? '').trim()
  if (id === 'vosk') return 'vosk'
  if (id === 'sistema' || id === 'google') return 'google-online'
  return normalizarMotorStt(id)
}

/** Etiqueta para la UI; devuelve el valor crudo si es desconocido. */
export function etiquetaMotorStt(valor) {
  return ETIQUETAS_MOTOR_STT[normalizarMotorStt(valor)] ?? (valor ? String(valor) : '—')
}
