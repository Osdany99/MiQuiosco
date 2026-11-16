import { Capacitor } from '@capacitor/core'
import { useVozDisparo } from '../composables/useVozDisparo'

/**
 * Rutas que acepta el deeplink. `/inventario` se mantiene como alias porque el
 * atajo antiguo la usaba y antes se rechazaba en silencio.
 */
const RUTAS = {
  '/quiosco': '/quiosco',
  '/almacen': '/almacen',
  '/inventario': '/almacen',
  '/pendientes': '/pendientes'
}

/**
 * Traduce una URL (propia o https) a `{ ruta, voz }`.
 * `voz` indica si el enlace debe abrir el micrófono al llegar.
 */
export function resolverRuta(url) {
  let target = ''
  let voz = false
  try {
    const u = new URL(url)
    if (u.protocol === 'miqiosco:') {
      if (u.host === 'voice') {
        const parte = (u.pathname || '/quiosco').replace(/^\/+/, '').split('/')[0]
        target = `/${parte || 'quiosco'}`
      } else {
        target = `/${u.host}`
      }
      voz = u.searchParams.get('voice') === '1'
    } else if (u.protocol === 'http:' || u.protocol === 'https:') {
      target = u.pathname || ''
      voz = u.searchParams.get('voice') === '1'
    }
  } catch {
    return null
  }

  const ruta = RUTAS[target]
  if (!ruta) return null
  return { ruta, voz }
}

export default defineNuxtPlugin((nuxtApp) => {
  if (!Capacitor.isNativePlatform()) return

  const router = nuxtApp.$router
  if (!router) return

  const disparo = useVozDisparo()
  let ultimaUrl = ''
  let ultimaMs = 0

  function manejar(url) {
    const destino = resolverRuta(url)
    if (!destino) return
    const ahora = Date.now()
    // En arranque en frío, `getLaunchUrl()` y `appUrlOpen` pueden entregar el
    // mismo toque: se ignora el duplicado inmediato.
    if (url === ultimaUrl && ahora - ultimaMs < 1500) return
    ultimaUrl = url
    ultimaMs = ahora

    if (destino.voz) {
      // Primero la señal (lleva la ruta objetivo) y después la navegación: si
      // se navega primero, la instancia de la ruta vieja puede consumir el
      // disparo antes de que el enrutador cambie.
      disparo.pedir(destino.ruta)
    }
    void router.push(destino.ruta).catch(() => {})
  }

  void import('@capacitor/app').then(({ App }) => {
    App.addListener('appUrlOpen', event => manejar(event.url))
    // Arranque en frío desde widget/atajo: `appUrlOpen` no se emite.
    App.getLaunchUrl?.()
      .then((res) => {
        if (res?.url) manejar(res.url)
      })
      .catch(() => {})
  }).catch(() => {})
})
