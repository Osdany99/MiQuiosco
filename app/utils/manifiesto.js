import { $api } from './api'
import { API_ROUTES } from './api-paths'

/**
 * Manifiesto de versiones (`/api/app-version`) con caché corta.
 *
 * Lo consultan el modelo de voz, el bundle web y el aviso de actualización de
 * la APK. Al arrancar, los tres preguntan casi a la vez: sin caché serían tres
 * peticiones idénticas. El TTL es corto para que un release publicado mientras
 * la app está abierta se note en el siguiente sync, no en la siguiente sesión.
 */

const TTL_MS = 5 * 60 * 1000

let cache = { at: 0, valor: null }

export async function leerManifiesto({ forzar = false } = {}) {
  if (!forzar && cache.valor && Date.now() - cache.at < TTL_MS) {
    return cache.valor
  }
  const respuesta = await $api(API_ROUTES.appVersion)
  cache = { at: Date.now(), valor: respuesta ?? null }
  return cache.valor
}

/** Tras publicar algo (soporte en Ajustes) conviene no quedarse con el valor viejo. */
export function invalidarManifiesto() {
  cache = { at: 0, valor: null }
}
