export default defineNuxtRouteMiddleware(async (to) => {
  const publicRoutes = ['/login', '/cambiar-pin']
  if (publicRoutes.includes(to.path)) return

  const auth = useAuth()
  await auth.cargarDesdePreferencias()

  if (auth.sesionLocal.value && !auth.sesionLocalVigente()) {
    await auth.invalidarSesionLocal()
    return navigateTo('/login', { query: { reason: 'session_expired', redirect: to.fullPath } })
  }

  const tieneSesion = auth.sesionLocal.value || auth.usuarioActual.value
  const tieneToken = auth.jwtSync.value

  if (!tieneSesion && !tieneToken) {
    return navigateTo('/login', { query: { redirect: to.fullPath } })
  }
})
