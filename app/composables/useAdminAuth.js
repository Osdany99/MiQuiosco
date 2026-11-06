/**
 * useAdminAuth — sesión del panel web de super administración.
 *
 * Contexto separado de `useAuth` (APK): el super admin no usa vistas de
 * negocio, y el APK rechaza su cuenta a propósito. Aquí el token se guarda en
 * `localStorage` (el panel es web y `ssr: false`) bajo su propia clave, para no
 * mezclarse con la sesión local del jefe.
 *
 * El token que emite `/api/auth/login` para un `super_admin` solo sirve en
 * `/api/admin/*` (el resto de endpoints operativos exigen rol `jefe`).
 */
const PREF_ADMIN = 'admin_sesion'

export function useAdminAuth() {
  const token = useState('admin.token', () => null)
  const usuario = useState('admin.usuario', () => null)
  const expiraEn = useState('admin.expiraEn', () => null)
  const cargando = useState('admin.cargando', () => false)

  /** Hay token y no ha caducado (no comprueba validez contra el servidor). */
  function sesionVigente() {
    return Boolean(token.value && expiraEn.value && expiraEn.value > Date.now())
  }

  function limpiarSesion() {
    token.value = null
    usuario.value = null
    expiraEn.value = null
    if (import.meta.client) {
      try {
        localStorage.removeItem(PREF_ADMIN)
      } catch {
        // Almacenamiento no disponible: el estado en memoria ya está limpio.
      }
    }
  }

  /** Recupera la sesión guardada. Caducada o corrupta se descarta sin ruido. */
  function cargarDesdeAlmacen() {
    if (!import.meta.client) return
    try {
      const bruto = localStorage.getItem(PREF_ADMIN)
      if (!bruto) return

      const sesion = JSON.parse(bruto)
      if (!sesion?.token || !sesion?.expiraEn || sesion.expiraEn <= Date.now()) {
        limpiarSesion()
        return
      }

      token.value = sesion.token
      usuario.value = sesion.usuario ?? null
      expiraEn.value = sesion.expiraEn
    } catch {
      limpiarSesion()
    }
  }

  async function iniciarSesion(nombreUsuario, pin) {
    cargando.value = true
    try {
      const respuesta = await $fetch('/api/auth/login', {
        method: 'POST',
        body: { nombre_usuario: nombreUsuario.trim(), pin }
      })

      // El login del servidor también acepta jefes: el panel solo admite la
      // cuenta de administración. Sin esto, un jefe podría entrar aquí.
      if (respuesta?.usuario?.rol !== 'super_admin') {
        limpiarSesion()
        throw new Error('Esta cuenta no tiene acceso al panel de administración.')
      }

      token.value = respuesta.token
      usuario.value = respuesta.usuario
      expiraEn.value = respuesta.expiraEn

      if (import.meta.client) {
        localStorage.setItem(PREF_ADMIN, JSON.stringify({
          token: respuesta.token,
          usuario: respuesta.usuario,
          expiraEn: respuesta.expiraEn
        }))
      }

      return respuesta
    } finally {
      cargando.value = false
    }
  }

  async function cerrarSesion() {
    const tokenActual = token.value
    limpiarSesion()

    // La blacklist del servidor es en memoria: si falla, la expiración del JWT
    // sigue siendo la barrera. Nunca debe impedir salir del panel.
    if (tokenActual) {
      await $fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenActual}` }
      }).catch(() => {})
    }

    await navigateTo('/admin/login')
  }

  function cabeceras() {
    return token.value ? { Authorization: `Bearer ${token.value}` } : {}
  }

  return {
    token: readonly(token),
    usuario: readonly(usuario),
    expiraEn: readonly(expiraEn),
    cargando: readonly(cargando),
    sesionVigente,
    cargarDesdeAlmacen,
    iniciarSesion,
    cerrarSesion,
    limpiarSesion,
    cabeceras
  }
}
