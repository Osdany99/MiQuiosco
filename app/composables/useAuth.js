import { computed, readonly } from 'vue'
import { Preferences } from '@capacitor/preferences'
import { $api, esErrorDeRed } from '../utils/api'
import { API_ROUTES } from '../utils/api-paths'
import { login as loginOfflineApi } from '../server-offline/api/auth/login'

/**
 * Dos contextos de autenticación, completamente aislados:
 *
 * A. Sesión local del jefe/trabajador (offline-first, en dispositivo).
 *    Vive en @capacitor/preferences bajo la clave 'sesion_local'.
 *
 * B. JWT de sincronización del jefe (server-side, solo /api/sync/*).
 *    Vive en @capacitor/preferences bajo la clave 'jwt_sync'.
 *
 * Reglas de oro:
 * - El jefe/trabajador nunca envían la sesión local al servidor (sin JWT).
 * - El JWT de sync solo da acceso a /api/sync/* (validado en el backend).
 * - Sincronizar exige sesión local vigente + JWT de sync válido simultáneamente.
 */

/**
 * useAuth - Composable principal de autenticación (sesiones, JWT, roles, login/logout).
 *
 * @returns {Object} Estado y métodos de autenticación:
 * @returns {ComputedRef<Object|null>} returns.sesionLocal - Sesión local (jefe/trabajador) reactiva de solo lectura.
 * @returns {ComputedRef<string|null>} returns.jwtSync - JWT de sincronización reactivo de solo lectura.
 * @returns {ComputedRef<Object|null>} returns.usuarioActual - Usuario actual reactivo de solo lectura.
 * @returns {ComputedRef<boolean>} returns.cargando - True durante operaciones async.
 * @returns {ComputedRef<boolean>} returns.esJefe - True si rol === 'jefe'.
 * @returns {ComputedRef<boolean>} returns.esTrabajador - True si rol === 'trabajador'.
 * @returns {ComputedRef<string|null>} returns.rol - Rol actual ('jefe' | 'trabajador' | null).
 * @returns {Function} returns.cargarDesdePreferencias - Carga sesión/JWTs desde Capacitor Preferences.
 * @returns {Function} returns.login - Login online/offline: (nombreUsuario, pin) => Promise<response>.
 * @returns {Function} returns.sesionLocalVigente - Verifica si la sesión local no ha expirado.
 * @returns {Function} returns.registrarActividad - Actualiza timestamp de última actividad (jefe).
 * @returns {Function} returns.invalidarSesionLocal - Limpia sesión local y JWT de sync.
 * @returns {Function} returns.logout - Cierre completo (servidor + local + redirect a /login).
 *
 * @example
 * const { usuarioActual, esJefe, login, logout, cargarDesdePreferencias } = useAuth()
 *
 * // En onMounted
 * await cargarDesdePreferencias()
 *
 * // Login
 * try {
 *   await login('jefe1', '1234')
 * } catch (err) {
 *   console.error('Login fallido:', err)
 * }
 *
 * // Logout
 * await logout()
 */
const PREF_SESION_LOCAL = 'sesion_local'
const PREF_JWT_SYNC = 'jwt_sync'

export function useAuth() {
  const config = useRuntimeConfig()
  const sesionLocal = useState('auth.sesionLocal', () => null)
  const jwtSync = useState('auth.jwtSync', () => null)
  const usuarioActual = useState('auth.usuarioActual', () => null)
  const cargando = useState('auth.cargando', () => false)

  const esJefe = computed(() => usuarioActual.value?.rol === 'jefe')
  const esTrabajador = computed(
    () => usuarioActual.value?.rol === 'trabajador'
  )
  const rol = computed(() => usuarioActual.value?.rol ?? null)

  async function cargarDesdePreferencias() {
    cargando.value = true
    try {
      const [sesionStr, syncJwt] = await Promise.all([
        Preferences.get({ key: PREF_SESION_LOCAL }),
        Preferences.get({ key: PREF_JWT_SYNC })
      ])

      if (sesionStr.value) {
        const sesion = JSON.parse(sesionStr.value)
        sesionLocal.value = sesion
        usuarioActual.value = {
          id: sesion.usuario_id,
          nombre: sesion.usuario_nombre,
          rol: sesion.rol,
          puestoId: sesion.puesto_id ?? ''
        }
      }

      if (syncJwt.value) jwtSync.value = syncJwt.value
    } finally {
      cargando.value = false
    }
  }

  async function login(nombreUsuario, pin) {
    cargando.value = true
    try {
      try {
        const response = await $api(API_ROUTES.authLogin, {
          method: 'POST',
          body: { nombre_usuario: nombreUsuario, pin }
        })
        await procesarRespuestaLogin(response)
        return response
      } catch (err) {
        if (esErrorDeRed(err)) {
          const sesion = await loginOffline(nombreUsuario, pin)
          if (sesion) {
            return {
              usuario: {
                id: sesion.usuario_id,
                nombre: sesion.usuario_nombre,
                rol: sesion.rol,
                puestoId: sesion.puesto_id ?? ''
              },
              expiraEn: sesion.expira_en ?? undefined
            }
          }
        }
        throw err
      }
    } finally {
      cargando.value = false
    }
  }

  async function procesarRespuestaLogin(response) {
    if (!response.usuario) {
      throw new Error('Respuesta del servidor sin datos de usuario.')
    }
    usuarioActual.value = response.usuario

    const ahora = Date.now()
    const horasExp = Number(config.public.sessionExpirationTrabajadorHoras)

    if (response.token) {
      await Preferences.set({ key: PREF_JWT_SYNC, value: response.token })
      jwtSync.value = response.token
      const sesion = {
        usuario_id: response.usuario.id,
        usuario_nombre: response.usuario.nombre,
        rol: response.usuario.rol,
        puesto_id: response.usuario.puestoId ?? '',
        pin_hash_local: '',
        expira_en: null,
        ultima_actividad_en: ahora
      }
      await Preferences.set({
        key: PREF_SESION_LOCAL,
        value: JSON.stringify(sesion)
      })
      sesionLocal.value = sesion

      // Hidratar caché local con datos del servidor (pinHash incluido)
      // No bloqueante — si falla (sin red, etc.), el login igual es exitoso.
      const { pullServidor } = useSync()
      pullServidor({ silent: true }).catch(() => {})
    } else {
      if (response.usuario.rol === 'trabajador') {
        const sesion = {
          usuario_id: response.usuario.id,
          usuario_nombre: response.usuario.nombre,
          rol: 'trabajador',
          puesto_id: response.usuario.puestoId ?? '',
          pin_hash_local: '',
          expira_en: ahora + horasExp * 60 * 60 * 1000,
          ultima_actividad_en: ahora
        }
        await Preferences.set({
          key: PREF_SESION_LOCAL,
          value: JSON.stringify(sesion)
        })
        sesionLocal.value = sesion
      }
    }
  }

  async function loginOffline(nombreUsuario, pin) {
    const resultado = await loginOfflineApi(nombreUsuario, pin)
    if (!resultado.ok) {
      if (resultado.motivo === 'usuario_inactivo') {
        throw new Error('Usuario no activo. Contacta al jefe.')
      }
      throw new Error('Credenciales inválidas.')
    }
    const usuario = resultado.usuario

    const ahora = Date.now()
    const sesion = {
      usuario_id: usuario.id,
      usuario_nombre: usuario.nombre,
      rol: usuario.rol === 'jefe' ? 'jefe' : 'trabajador',
      puesto_id: usuario.puestoId,
      pin_hash_local: usuario.pinHash,
      expira_en:
        usuario.rol === 'trabajador' ? ahora + 24 * 60 * 60 * 1000 : null,
      ultima_actividad_en: ahora
    }

    await Preferences.set({
      key: PREF_SESION_LOCAL,
      value: JSON.stringify(sesion)
    })
    sesionLocal.value = sesion
    usuarioActual.value = {
      id: usuario.id,
      nombre: usuario.nombre,
      rol: usuario.rol,
      puestoId: usuario.puestoId
    }
    return sesion
  }

  function sesionLocalVigente() {
    if (!sesionLocal.value) return false

    const ahora = Date.now()
    const sesion = sesionLocal.value

    if (sesion.rol === 'trabajador') {
      if (sesion.expira_en && ahora > sesion.expira_en) return false
      return true
    }

    const inactTimeout = Number(config.public.sessionInactivityTimeoutJefeSegundos)
    const limiteMs = inactTimeout * 1000
    if (ahora - sesion.ultima_actividad_en > limiteMs) return false
    return true
  }

  async function registrarActividad() {
    if (!sesionLocal.value || sesionLocal.value.rol !== 'jefe') return
    sesionLocal.value = {
      ...sesionLocal.value,
      ultima_actividad_en: Date.now()
    }
    await Preferences.set({
      key: PREF_SESION_LOCAL,
      value: JSON.stringify(sesionLocal.value)
    })
  }

  async function invalidarSesionLocal() {
    if (!sesionLocal.value) return

    if (sesionLocal.value.rol === 'jefe') {
      await Preferences.remove({ key: PREF_JWT_SYNC })
      jwtSync.value = null
    }

    await Preferences.remove({ key: PREF_SESION_LOCAL })
    sesionLocal.value = null
    usuarioActual.value = null
  }

  async function logout() {
    try {
      const token = jwtSync.value
      if (token) {
        await $api(API_ROUTES.authLogout, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        }).catch(() => {})
      }
    } finally {
      await Promise.all([
        Preferences.remove({ key: PREF_JWT_SYNC }),
        Preferences.remove({ key: PREF_SESION_LOCAL })
      ])
      jwtSync.value = null
      sesionLocal.value = null
      usuarioActual.value = null
      await navigateTo('/login')
    }
  }

  return {
    sesionLocal: readonly(sesionLocal),
    jwtSync: readonly(jwtSync),
    usuarioActual: readonly(usuarioActual),
    cargando: readonly(cargando),
    esJefe,
    esTrabajador,
    rol,
    cargarDesdePreferencias,
    login,
    sesionLocalVigente,
    registrarActividad,
    invalidarSesionLocal,
    logout
  }
}
