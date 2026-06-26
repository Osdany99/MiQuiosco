export default defineNuxtRouteMiddleware(() => {
  const auth = useAuth()
  if (!auth.esJefe.value) {
    return navigateTo(auth.esAdmin.value ? '/usuarios' : '/registro-trabajador')
  }
})
