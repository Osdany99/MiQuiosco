export default defineNuxtRouteMiddleware(() => {
  const auth = useAuth()
  if (!auth.esTrabajador.value) {
    return navigateTo(auth.esAdmin.value ? '/usuarios' : '/cuadre')
  }
})
