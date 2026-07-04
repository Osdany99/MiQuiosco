export default defineNuxtRouteMiddleware(async (to) => {
  // Rutas públicas que no requieren autenticación
  const publicRoutes = ['/login', '/cambiar-pin']
  if (publicRoutes.includes(to.path)) return

  const auth = useAuth()
  await auth.cargarDesdePreferencias()

  // Si no hay sesión local ni JWT, redirigir a login
  if (!auth.sesionLocal.value && !auth.jwtAdmin.value) {
    return navigateTo('/login', { query: { redirect: to.fullPath } })
  }
})
