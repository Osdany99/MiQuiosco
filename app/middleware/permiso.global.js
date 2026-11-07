/* eslint-disable @stylistic/max-statements-per-line */
import { useAuth } from '../composables/useAuth'
import { usePermisos } from '../composables/usePermisos'
import { vistaDeRuta } from '#shared/permisos'

export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === '/admin' || to.path.startsWith('/admin/')) return
  const publicRoutes = ['/login', '/descargar']
  if (publicRoutes.includes(to.path)) return

  const auth = useAuth()
  if (!auth.esJefe.value) return

  const perms = usePermisos()
  try { await perms.cargarDesdePreferencias() } catch {}

  const vista = vistaDeRuta(to.path)
  if (vista && !perms.puedeVista(vista)) {
    return navigateTo('/cuadre', { query: { reason: 'sin_permiso' } })
  }
})
