import { Capacitor } from '@capacitor/core'

function resolverRuta(url) {
  let target = ''
  let query = ''
  try {
    const u = new URL(url)
    if (u.protocol === 'miqiosco:') {
      if (u.host === 'voice') {
        const parte = (u.pathname || '/quiosco').replace(/^\/+/, '')
        target = `/${parte || 'quiosco'}`
      } else if (u.host === 'quiosco' || u.host === 'almacen') {
        target = `/${u.host}`
      }
      query = u.search
    } else if (u.protocol === 'http:' || u.protocol === 'https:') {
      target = u.pathname || ''
      query = u.search
    }
  } catch {
    return null
  }

  if (target !== '/quiosco' && target !== '/almacen') return null
  return target + (query || '')
}

export default defineNuxtPlugin((nuxtApp) => {
  if (!Capacitor.isNativePlatform()) return

  const router = nuxtApp.$router
  if (!router) return

  void import('@capacitor/app').then(({ App }) => {
    App.addListener('appUrlOpen', (event) => {
      const path = resolverRuta(event.url)
      if (!path) return
      router.push(path)
    })
  }).catch(() => {})
})
