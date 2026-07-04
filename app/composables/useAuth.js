import { computed, readonly } from 'vue'
import { Preferences } from '@capacitor/preferences'
import bcrypt from 'bcryptjs'
import { API } from '~/services/api-routes'

/**
 * Tres contextos de autenticación, completamente aislados:
 *
 * A. Sesión local del jefe/trabajador (offline-first, solo en dispositivo).
 *    Vive en @capacitor/preferences bajo la clave 'sesion_local'.
 *
 * B. JWT del admin (server-side, siempre online).
 *    Vive en @capacitor/preferences bajo la clave 'jwt_admin'.
 *
 * C. JWT de sincronización del jefe (server-side, solo /api/sync/*).
 *    Vive en @capacitor/preferences bajo la clave 'jwt_sync'.
 *
 * Reglas de oro:
 * - El admin nunca usa SQLite local.
 * - El jefe/trabajador nunca envían la sesión local al servidor.
 * - El JWT de sync solo da acceso a /api/sync/* (validado en el backend).
 * - Sincronizar exige sesión local vigente + JWT de sync válido simultáneamente.
 */

/**
 * useAuth - Composable principal de autenticación (sesiones, JWT, roles, login/logout).
 *
 * @returns {Object} Estado y métodos de autenticación:
 * @returns {ComputedRef<Object|null>} returns.sesionLocal - Sesión local (jefe/trabajador) reactiva de solo lectura.
 * @returns {ComputedRef<string|null>} returns.jwtAdmin - JWT de admin reactivo de solo lectura.
 * @returns {ComputedRef<string|null>} returns.jwtSync - JWT de sincronización reactivo de solo lectura.
 * @returns {ComputedRef<Object|null>} returns.usuarioActual - Usuario actual reactivo de solo lectura.
 * @returns {ComputedRef<boolean>} returns.requiereCambioPin - Si el usuario debe cambiar PIN.
 * @returns {ComputedRef<boolean>} returns.cargando - True durante operaciones async.
 * @returns {ComputedRef<boolean>} returns.esAdmin - True si rol === 'admin'.
 * @returns {ComputedRef<boolean>} returns.esJefe - True si rol === 'jefe'.
 * @returns {ComputedRef<boolean>} returns.esTrabajador - True si rol === 'trabajador'.
 * @returns {ComputedRef<string|null>} returns.rol - Rol actual ('admin' | 'jefe' | 'trabajador' | null).
 * @returns {Function} returns.cargarDesdePreferencias - Carga sesión/JWTs desde Capacitor Preferences.
 * @returns {Function} returns.login - Login online/offline: (nombreUsuario, pin) => Promise<response>.
 * @returns {Function} returns.sesionLocalVigente - Verifica si la sesión local no ha expirado.
 * @returns {Function} returns.registrarActividad - Actualiza timestamp de última actividad (jefe).
 * @returns {Function} returns.invalidarSesionLocal - Limpia sesión local y JWT de sync.
 * @returns {Function} returns.logout - Cierre completo (servidor + local + redirect a /login).
 *
 * @example
 * const { usuarioActual, esAdmin, login, logout, cargarDesdePreferencias } = useAuth()
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
const PREF_JWT_ADMIN = 'jwt_admin'
const PREF_JWT_SYNC = 'jwt_sync'
const PREF_PIN_HASH_LOCAL = 'pin_hash_local'

export function useAuth() {
  const sesionLocal = useState('auth.sesionLocal', () => null)
  const jwtAdmin = useState('auth.jwtAdmin', () => null)
  const jwtSync = useState('auth.jwtSync', () => null)
  const usuarioActual = useState('auth.usuarioActual', () => null)
  const requiereCambioPin = useState('auth.requiereCambioPin', () => false)
  const cargando = useState('auth.cargando', () => false)

  const esAdmin = computed(() => usuarioActual.value?.rol === 'admin')
  const esJefe = computed(() => usuarioActual.value?.rol === 'jefe')
  const esTrabajador = computed(
    () => usuarioActual.value?.rol === 'trabajador'
  )
  const rol = computed(() => usuarioActual.value?.rol ?? null)

  async function cargarDesdePreferencias() {
    cargando.value = true
    try {
      const [sesionStr, adminJwt, syncJwt] = await Promise.all([
        Preferences.get({ key: PREF_SESION_LOCAL }),
        Preferences.get({ key: PREF_JWT_ADMIN }),
        Preferences.get({ key: PREF_JWT_SYNC })
      ])

      if (sesionStr.value) {
        const sesion = JSON.parse(sesionStr.value)
        sesionLocal.value = sesion
        usuarioActual.value = {
          id: sesion.usuario_id,
          nombre: sesion.usuario_nombre,
          rol: sesion.rol,
          puestoId: ''
        }
      }

      if (adminJwt.value) jwtAdmin.value = adminJwt.value
      if (syncJwt.value) jwtSync.value = syncJwt.value
    } finally {
      cargando.value = false
    }
  }

  async function login(nombreUsuario, pin) {
    cargando.value = true
    try {
      try {
        const response = await $fetch(API.auth.login, {
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
                puestoId: ''
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
    requiereCambioPin.value = response.requiereCambioPin ?? false

    if (response.requiereCambioPin) {
      return
    }

    const ahora = Date.now()
    const horasExp = Number(
      process.env.SESSION_EXPIRATION_TRABAJADOR_HORAS || 24
    )

    if (response.token) {
      if (response.usuario.rol === 'admin') {
        await Preferences.set({ key: PREF_JWT_ADMIN, value: response.token })
        jwtAdmin.value = response.token
      } else if (response.usuario.rol === 'jefe') {
        await Preferences.set({ key: PREF_JWT_SYNC, value: response.token })
        jwtSync.value = response.token
        const sesion = {
          usuario_id: response.usuario.id,
          usuario_nombre: response.usuario.nombre,
          rol: 'jefe',
          pin_hash_local: '',
          expira_en: null,
          ultima_actividad_en: ahora
        }
        await Preferences.set({
          key: PREF_SESION_LOCAL,
          value: JSON.stringify(sesion)
        })
        sesionLocal.value = sesion
      }
    } else {
      if (response.usuario.rol === 'trabajador') {
        const sesion = {
          usuario_id: response.usuario.id,
          usuario_nombre: response.usuario.nombre,
          rol: 'trabajador',
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
    const { getUsuarioPorNombreLocal } = useLocalDb()
    const usuario = await getUsuarioPorNombreLocal(nombreUsuario)

    if (!usuario || !usuario.activo) return null

    const hashLocal = await Preferences.get({
      key: `${PREF_PIN_HASH_LOCAL}_${usuario.id}`
    })
    if (!hashLocal.value) return null

    const pinOk = await bcrypt.compare(pin, hashLocal.value)
    if (!pinOk) return null

    const ahora = Date.now()
    const sesion = {
      usuario_id: usuario.id,
      usuario_nombre: usuario.nombre,
      rol: usuario.rol === 'jefe' ? 'jefe' : 'trabajador',
      pin_hash_local: hashLocal.value,
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

    const inactTimeout = Number(
      process.env.SESSION_INACTIVITY_TIMEOUT_JEFE_SEGUNDOS || 60
    )
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
      const token = jwtAdmin.value || jwtSync.value
      if (token) {
        await $fetch(API.auth.logout, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        }).catch(() => {})
      }
    } finally {
      await Promise.all([
        Preferences.remove({ key: PREF_JWT_ADMIN }),
        Preferences.remove({ key: PREF_JWT_SYNC }),
        Preferences.remove({ key: PREF_SESION_LOCAL })
      ])
      jwtAdmin.value = null
      jwtSync.value = null
      sesionLocal.value = null
      usuarioActual.value = null
      requiereCambioPin.value = false
      await navigateTo('/login')
    }
  }

  function esErrorDeRed(err) {
    if (typeof err === 'object' && err !== null) {
      const e = err
      if (!e.statusCode) return true
      if (e.message?.toLowerCase().includes('fetch')) return true
      if (e.message?.toLowerCase().includes('network')) return true
    }
    return false
  }

  return {
    sesionLocal: readonly(sesionLocal),
    jwtAdmin: readonly(jwtAdmin),
    jwtSync: readonly(jwtSync),
    usuarioActual: readonly(usuarioActual),
    requiereCambioPin: readonly(requiereCambioPin),
    cargando: readonly(cargando),
    esAdmin,
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
