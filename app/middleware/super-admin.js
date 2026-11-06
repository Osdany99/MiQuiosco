/**
 * Guard del panel de administración.
 *
 * Comprueba la sesión guardada en localStorage (token + expiración). La
 * validez real contra el servidor la hacen los endpoints `/api/admin/*`; un 401
 * limpia la sesión y devuelve al login desde `useAdminApi`.
 */
export default defineNuxtRouteMiddleware((to) => {
  const admin = useAdminAuth()
  admin.cargarDesdeAlmacen()

  if (!admin.sesionVigente()) {
    return navigateTo({ path: '/admin/login', query: { redirect: to.fullPath } })
  }
})
