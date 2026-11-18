/**
 * app/utils/voice/idioma.js — Selección del idioma de reconocimiento (puro).
 *
 * El teléfono puede tener instalado el paquete offline de un español distinto
 * al que pide la app (p. ej. es-US en vez de es-ES). Si se fuerza es-ES, el
 * reconocedor responde ERROR_LANGUAGE_UNAVAILABLE (13) aunque el usuario sí
 * tenga un paquete offline.
 *
 * `sistema` resuelve a null: el plugin nativo deja que Android use su locale
 * (el mismo que usa el teclado). Si el sistema no está en español, se usa
 * es-US para que la app siga entendiendo español.
 */

export const IDIOMAS_VOZ = [
  { id: 'sistema', label: 'Sistema (recomendado)', valor: null },
  { id: 'es-US', label: 'Español (EE.UU.)', valor: 'es-US' },
  { id: 'es-ES', label: 'Español (España)', valor: 'es-ES' },
  { id: 'es-419', label: 'Español (Latinoamérica)', valor: 'es-419' }
]

export function normalizarIdiomaSistema(idioma) {
  const valor = String(idioma ?? '').trim()
  return valor || 'es-US'
}

/**
 * Devuelve lo que se pasa al plugin:
 * - `sistema` → null si el locale del sistema es español (Android usará es-US,
 *   es-ES, etc. según lo instalado).
 * - `sistema` → 'es-US' si el sistema no es español.
 * - idioma explícito → tal cual.
 */
export function resolverIdioma(preferencia, idiomaSistema) {
  const sistema = normalizarIdiomaSistema(idiomaSistema)
  if (!preferencia || preferencia === 'sistema') {
    // Siempre un idioma explícito: el servicio online del teléfono necesita
    // EXTRA_LANGUAGE; con null respondía no_match.
    return sistema.toLowerCase().startsWith('es') ? sistema : 'es-US'
  }
  return preferencia
}

/** Texto para la UI: "Sistema (es-US)" o el idioma explícito. */
export function etiquetaIdioma(preferencia, idiomaEfectivo, idiomaSistema) {
  if (!preferencia || preferencia === 'sistema') {
    const sistema = idiomaEfectivo || normalizarIdiomaSistema(idiomaSistema)
    return `Sistema (${sistema})`
  }
  return preferencia
}
