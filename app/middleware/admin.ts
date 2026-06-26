export default defineNuxtRouteMiddleware(() => {
  const auth = useAuth()
  if (!auth.esAdmin.value) {
    return navigateTo('/cuadre')
  }
})
