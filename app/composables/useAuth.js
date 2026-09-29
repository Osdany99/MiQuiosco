import { computed, readonly } from 'vue'
import { Capacitor } from '@capacitor/core'
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
 * @returns {Function} returns.biometricoDisponible - (solo nativo) true si hay biometría enrolada usable por la app.
 * @returns {Function} returns.biometricoHabilitado - true si el usuario activó entrar con huella en este dispositivo.
 * @returns {Function} returns.biometricoUsuario - nombre del usuario guardado para la huella (o null).
 * @returns {Function} returns.habilitarBiometrico - Guarda usuario + PIN cifrado: (nombreUsuario, pin) => Promise<void>.
 * @returns {Function} returns.deshabilitarBiometrico - Borra flag y credenciales de huella del dispositivo.
 * @returns {Function} returns.loginConHuella - Prompt nativo + login(usuario, pin) guardado. Lanza Error si falla.
 * @returns {Ref<number>} returns.intentosBiometricosFallidos - Fallos consecutivos de huella (límite 3).
 * @returns {Function} returns.webAuthnDisponible - (solo web) true si el navegador tiene autenticador de plataforma.
 * @returns {Function} returns.loginConWebauthn - Login web con huella: (nombreUsuario) => Promise<{ok, response}>.
 * @returns {Function} returns.registrarWebauthn - Enrola este navegador: (nombreUsuario, pin, nombreDispositivo).
 * @returns {Function} returns.listarWebauthn - Dispositivos con huella: (nombreUsuario, pin) => Promise<array>.
 * @returns {Function} returns.borrarWebauthn - Revoca un dispositivo: (nombreUsuario, pin, credentialId).
 * @returns {Function} returns.olvidarEsteNavegadorWebauthn - Revoca la huella de este navegador.
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

// --- Biometría (solo Android nativo) ---
// El flag y el usuario viven en Preferences (no sensibles); el PIN vive
// cifrado en el Keystore vía @aparajita/capacitor-secure-storage.
// Nada de esto toca la BD ni el servidor: loginConHuella() re-ejecuta
// login() con las credenciales guardadas.
const PREF_BIOMETRICO_FLAG = 'biometrico_habilitado'
const PREF_BIOMETRICO_USUARIO = 'biometrico_usuario'
const SECURE_KEY_PIN = 'biometrico_pin'
// WebAuthn (solo web): el credential_id de ESTE navegador, para poder
// "olvidar este navegador" sin pedir el PIN de nuevo.
const PREF_WEBAUTHN_CRED_ID = 'webauthn_credential_id'
const MAX_INTENTOS_BIOMETRICOS = 3
const MSG_CREDENCIALES_INVALIDAS = 'Credenciales inválidas.'

export function useAuth() {
  const config = useRuntimeConfig()
  const sesionLocal = useState('auth.sesionLocal', () => null)
  const jwtSync = useState('auth.jwtSync', () => null)
  const usuarioActual = useState('auth.usuarioActual', () => null)
  const cargando = useState('auth.cargando', () => false)
  const intentosBiometricosFallidos = useState('auth.intentosBiometricosFallidos', () => 0)

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
        intentosBiometricosFallidos.value = 0
        return response
      } catch (err) {
        if (esErrorDeRed(err)) {
          const sesion = await loginOffline(nombreUsuario, pin)
          if (sesion) {
            intentosBiometricosFallidos.value = 0
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
      // Llamamos directamente: procesarRespuestaLogin se invoca desde login() que está en setup context.
      if (import.meta.client) {
        try {
          const { useSync } = await import('./useSync.js')
          const { pullServidor } = useSync()
          pullServidor({ silent: true }).catch(() => {})
        } catch {
          // noop
        }
      }
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
      if (resultado.motivo === 'error_interno') {
        throw new Error('Error interno en la base de datos local. Intenta reiniciar la app o reinstalarla.')
      }
      if (resultado.motivo === 'usuario_inactivo') {
        throw new Error('Usuario no activo. Contacta al jefe.')
      }
      if (resultado.motivo === 'cliente_no_puede_loguearse') {
        throw new Error('Los clientes no pueden iniciar sesión aún. Próximamente habilitado.')
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

    // Defecto seguro: sin valor configurado la sesión del jefe moriría al
    // instante (Number('') = 0). 60 s conserva el comportamiento actual.
    const inactTimeout = Number(config.public.sessionInactivityTimeoutJefeSegundos) || 60
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

  // --- Biometría (solo Android nativo) ---

  function esNativo() {
    return Capacitor.isNativePlatform()
  }

  async function biometricoDisponible() {
    if (!esNativo()) return false
    try {
      const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth')
      const info = await BiometricAuth.checkBiometry()
      // En Android solo isAvailable/strongBiometryIsAvailable son fiables;
      // biometryType puede reportar hardware no usable por apps.
      return !!info?.isAvailable
    } catch {
      return false
    }
  }

  async function biometricoHabilitado() {
    if (!esNativo()) return false
    try {
      const { value } = await Preferences.get({ key: PREF_BIOMETRICO_FLAG })
      return value === '1'
    } catch {
      return false
    }
  }

  async function biometricoUsuario() {
    if (!esNativo()) return null
    try {
      const { value } = await Preferences.get({ key: PREF_BIOMETRICO_USUARIO })
      return value || null
    } catch {
      return null
    }
  }

  async function habilitarBiometrico(nombreUsuario, pin) {
    if (!esNativo()) return
    const { SecureStorage } = await import('@aparajita/capacitor-secure-storage')
    await SecureStorage.set(SECURE_KEY_PIN, String(pin))
    await Preferences.set({ key: PREF_BIOMETRICO_USUARIO, value: nombreUsuario })
    await Preferences.set({ key: PREF_BIOMETRICO_FLAG, value: '1' })
  }

  async function deshabilitarBiometrico() {
    try {
      if (esNativo()) {
        const { SecureStorage } = await import('@aparajita/capacitor-secure-storage')
        await SecureStorage.remove(SECURE_KEY_PIN).catch(() => {})
      }
    } finally {
      await Preferences.remove({ key: PREF_BIOMETRICO_FLAG }).catch(() => {})
      await Preferences.remove({ key: PREF_BIOMETRICO_USUARIO }).catch(() => {})
      intentosBiometricosFallidos.value = 0
    }
  }

  function esPinInvalido(err) {
    const msg = err?.data?.statusMessage || err?.statusMessage || err?.message || ''
    return msg === MSG_CREDENCIALES_INVALIDAS
  }

  /**
   * Login con biometría: prompt nativo del sistema y luego login() normal
   * con las credenciales guardadas (misma semántica online/offline).
   * No borra nada salvo PIN probadamente incorrecto.
   * Retorna { cancelado: true } si el usuario cierra el diálogo.
   */
  async function loginConHuella() {
    if (!esNativo()) throw new Error('La huella solo está disponible en la app Android.')
    if (!(await biometricoHabilitado())) throw new Error('La huella no está activada en este dispositivo.')
    if (intentosBiometricosFallidos.value >= MAX_INTENTOS_BIOMETRICOS) {
      throw new Error('Demasiados intentos. Usa tu usuario y PIN.')
    }

    const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth')
    try {
      // El sistema presenta la biometría primaria disponible (rostro o
      // huella, según lo enrolado); allowDeviceCredential:false = solo biometría.
      await BiometricAuth.authenticate({
        reason: 'Desbloquear MiQuiosco',
        androidTitle: 'Entrar con huella',
        androidSubtitle: 'Usa tu biometría para iniciar sesión',
        allowDeviceCredential: false
      })
    } catch (err) {
      const code = err?.code || ''
      // Cancelar no es un fallo: volver en silencio al formulario.
      if (code === 'userCancel' || code === 'systemCancel' || code === 'userFallback' || code === 'appCancel') {
        return { cancelado: true }
      }
      // El SO bloquea solo tras varios fallos: forzar formulario hasta reintentar.
      if (code === 'biometryLockout') {
        throw new Error('Biometría bloqueada por el sistema. Espera unos minutos o usa tu usuario y PIN.')
      }
      intentosBiometricosFallidos.value += 1
      throw new Error('No se pudo verificar tu biometría. Intenta de nuevo o usa tu usuario y PIN.')
    }

    // Biometría OK: leer credenciales (el get puede fallar si el Keystore
    // cambió → caer al formulario sin romper nada).
    let nombreUsuario = null
    let pin = null
    try {
      const { SecureStorage } = await import('@aparajita/capacitor-secure-storage')
      const [usuarioPref, pinGuardado] = await Promise.all([
        Preferences.get({ key: PREF_BIOMETRICO_USUARIO }),
        SecureStorage.get(SECURE_KEY_PIN)
      ])
      nombreUsuario = usuarioPref?.value || null
      pin = pinGuardado != null ? String(pinGuardado) : null
    } catch {
      throw new Error('No se pudieron leer las credenciales guardadas. Usa tu usuario y PIN.')
    }
    if (!nombreUsuario || !pin) {
      await deshabilitarBiometrico()
      throw new Error('No hay credenciales guardadas. Usa tu usuario y PIN.')
    }

    try {
      const response = await login(nombreUsuario, pin)
      // El PIN puede haber cambiado desde que se guardó: refrescarlo.
      await habilitarBiometrico(nombreUsuario, pin)
      return { ok: true, response }
    } catch (err) {
      // Solo borrar ante PIN probadamente incorrecto (cambió en el servidor
      // o en otro dispositivo). Fallos de red u otros motivos conservan lo guardado.
      if (esPinInvalido(err)) {
        await deshabilitarBiometrico()
        throw new Error('El PIN guardado ya no es válido. Usa tu usuario y PIN para actualizarlo.')
      }
      throw err
    }
  }

  // --- WebAuthn: huella real en navegador (solo web, online) ---
  // A diferencia del plugin nativo, aquí no se guarda ningún PIN: el
  // navegador firma un challenge y el servidor verifica la clave pública.
  // Requiere conexión (el PIN offline sigue disponible en el modo normal).

  async function webAuthnDisponible() {
    if (esNativo()) return false
    if (typeof window === 'undefined' || typeof window.PublicKeyCredential === 'undefined') return false
    try {
      const { platformAuthenticatorIsAvailable } = await import('@simplewebauthn/browser')
      return await platformAuthenticatorIsAvailable()
    } catch {
      return false
    }
  }

  async function loginConWebauthn(nombreUsuario) {
    if (esNativo()) throw new Error('En la app Android se usa la huella del sistema.')
    cargando.value = true
    try {
      const options = await $api(API_ROUTES.webauthnLoginOptions, {
        method: 'POST',
        body: { nombre_usuario: nombreUsuario }
      })
      const { startAuthentication } = await import('@simplewebauthn/browser')
      const attResp = await startAuthentication({ optionsJSON: options })
      const response = await $api(API_ROUTES.webauthnLoginVerify, {
        method: 'POST',
        body: { nombre_usuario: nombreUsuario, respuesta: attResp }
      })
      await procesarRespuestaLogin(response)
      intentosBiometricosFallidos.value = 0
      return { ok: true, response }
    } finally {
      cargando.value = false
    }
  }

  async function registrarWebauthn(nombreUsuario, pin, nombreDispositivo) {
    if (esNativo()) throw new Error('En la app Android se usa la huella del sistema.')
    const options = await $api(API_ROUTES.webauthnRegisterOptions, {
      method: 'POST',
      body: { nombre_usuario: nombreUsuario, pin, nombre_dispositivo: nombreDispositivo }
    })
    const { startRegistration } = await import('@simplewebauthn/browser')
    const regResp = await startRegistration({ optionsJSON: options })
    const resultado = await $api(API_ROUTES.webauthnRegisterVerify, {
      method: 'POST',
      body: { nombre_usuario: nombreUsuario, respuesta: regResp, nombre_dispositivo: nombreDispositivo }
    })
    if (resultado?.credentialId) {
      await Preferences.set({ key: PREF_WEBAUTHN_CRED_ID, value: resultado.credentialId })
    }
    return resultado
  }

  async function listarWebauthn(nombreUsuario, pin) {
    const resultado = await $api(API_ROUTES.webauthnCredentialsList, {
      method: 'POST',
      body: { nombre_usuario: nombreUsuario, pin }
    })
    return resultado?.credentials ?? []
  }

  async function borrarWebauthn(nombreUsuario, pin, credentialId) {
    await $api(API_ROUTES.webauthnCredentialsDelete, {
      method: 'POST',
      body: { nombre_usuario: nombreUsuario, pin, credential_id: credentialId }
    })
    const { value } = await Preferences.get({ key: PREF_WEBAUTHN_CRED_ID })
    if (value && value === credentialId) {
      await Preferences.remove({ key: PREF_WEBAUTHN_CRED_ID })
    }
  }

  async function olvidarEsteNavegadorWebauthn(nombreUsuario, pin) {
    const { value } = await Preferences.get({ key: PREF_WEBAUTHN_CRED_ID })
    if (!value) throw new Error('Este navegador no tiene huella registrada.')
    await borrarWebauthn(nombreUsuario, pin, value)
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
    intentosBiometricosFallidos: readonly(intentosBiometricosFallidos),
    esJefe,
    esTrabajador,
    rol,
    cargarDesdePreferencias,
    login,
    sesionLocalVigente,
    registrarActividad,
    invalidarSesionLocal,
    logout,
    biometricoDisponible,
    biometricoHabilitado,
    biometricoUsuario,
    habilitarBiometrico,
    deshabilitarBiometrico,
    loginConHuella,
    webAuthnDisponible,
    loginConWebauthn,
    registrarWebauthn,
    listarWebauthn,
    borrarWebauthn,
    olvidarEsteNavegadorWebauthn
  }
}
