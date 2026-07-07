export default defineNuxtRouteMiddleware(() => {
  const auth = useAuth()
  if (!auth.esJefe.value) {
    return navigateTo('/cuadre')
  }
})
