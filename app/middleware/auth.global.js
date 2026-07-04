export default defineNuxtRouteMiddleware(async (to) => {
  const publicRoutes = ['/login', '/cambiar-pin']
  if (publicRoutes.includes(to.path)) return

  const auth = useAuth()
  await auth.cargarDesdePreferencias()

  const tieneSesion = auth.sesionLocal.value || auth.usuarioActual.value
  const tieneToken = auth.jwtAdmin.value || auth.jwtSync.value

  if (!tieneSesion && !tieneToken) {
    return navigateTo('/login', { query: { redirect: to.fullPath } })
  }
})
