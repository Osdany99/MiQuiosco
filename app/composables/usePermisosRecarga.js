/**
 * usePermisosRecarga - Onboarding de permisos del módulo de Recargas.
 *
 * Son tres pasos y solo se ejecutan la primera vez (o si el usuario revierte
 * algo en Ajustes):
 *
 *   1. Desbloquear "ajustes restringidos" — Android pone un candado a los
 *      permisos sensibles de toda app instalada fuera de Google Play. Con el
 *      candado puesto, el interruptor de SMS sale gris en Ajustes y el diálogo
 *      del sistema no concede nada. Es un paso fuera de la app, en Ajustes, y no
 *      tiene vuelta: por eso va primero.
 *   2. Permiso de SMS — diálogo normal de Android.
 *   3. Avisos de recarga — POST_NOTIFICATIONS, solo runtime desde Android 13.
 *
 * El estado es a scope de módulo (fuera de la función) porque app.vue lo
 * monta una vez y Configuración lo consulta en otro momento; con refs propias
 * cada uno vería un estado distinto.
 */
import { Preferences } from '@capacitor/preferences'
import { App } from '@capacitor/app'
import {
  smsEstado,
  smsEstaRestringido,
  smsPedirPermisos,
  smsPedirPermisoNotificaciones,
  smsAbrirAjustesPermisos
} from '../utils/sms'

const PREF_ONBOARDING = 'recargas_onboarding_v1'

/** 'oculto' | 'desbloquear' | 'sms' | 'notificaciones' | 'listo' */
const paso = ref('oculto')
const cargando = ref(false)
const estadoSms = ref({ disponible: false, permisoRecibir: false, permisoLeer: false })

let _resumeHook = null

export function usePermisosRecarga() {
  /**
   * Calcula en qué paso va el onboarding según el estado real, y lo escribe en
   * `paso`. Es idempotente: se puede llamar en cada arranque.
   */
  async function evaluar() {
    if (cargando.value) return paso.value
    cargando.value = true
    try {
      const [st, restringido] = await Promise.all([smsEstado(), smsEstaRestringido()])
      estadoSms.value = st

      if (!st.disponible) {
        paso.value = 'listo' // web: nada que pedir
        return paso.value
      }
      // El candado va primero: pedir el permiso antes de desbloquearlo es
      // un diálogo que no concede nada y solo confunde.
      if (restringido) {
        paso.value = 'desbloquear'
        return paso.value
      }
      if (!st.permisoRecibir) {
        paso.value = 'sms'
        return paso.value
      }
      await notificacionesOk()
      paso.value = 'listo'
      return paso.value
    } catch {
      paso.value = 'listo' // nunca bloquear la app por esto
      return paso.value
    } finally {
      cargando.value = false
    }
  }

  /** En API < 33 el permiso de notificaciones viene concedido de serie. */
  async function notificacionesOk() {
    try {
      const res = await smsPedirPermisoNotificaciones()
      return res.notificaciones
    } catch {
      return false
    }
  }

  /**
   * ¿Mostrar el asistente? Solo si nunca se completó y algo falta de verdad.
   * Si el usuario ya lo hizo una vez, no se le vuelve a interrumpir aunque
   * falte algo: el aviso vive en Configuración.
   */
  const debeMostrar = computed(() => paso.value !== 'oculto' && paso.value !== 'listo')

  /** Paso 1: abre Ajustes al candado de "ajustes restringidos". */
  function desbloquear() {
    return smsAbrirAjustesPermisos('restringidos')
  }

  /** Paso 2: diálogo de SMS. */
  async function pedirSms() {
    const res = await smsPedirPermisos()
    await evaluar()
    return res
  }

  /** Paso 3: diálogo de notificaciones. */
  async function pedirNotificaciones() {
    const res = await smsPedirPermisoNotificaciones()
    await evaluar()
    return res
  }

  /**
   * "Ahora no" / "Saltar". No borra la marca de completado a propósito: si el
   * usuario lo pospone para siempre, basta con que vuelva a evaluarse. Lo que
   * sí hace es dejar de interrumpir en cada arranque; si algo falta, el aviso
   * queda en Configuración.
   */
  async function posponer() {
    paso.value = 'oculto'
    const guardado = await Preferences.get({ key: PREF_ONBOARDING })
    const previo = guardado.value ? JSON.parse(guardado.value) : {}
    await Preferences.set({
      key: PREF_ONBOARDING,
      value: JSON.stringify({ ...previo, pospuestoEn: Date.now() })
    })
  }

  /** El usuario completó los tres pasos. */
  async function completar() {
    paso.value = 'listo'
    await Preferences.set({
      key: PREF_ONBOARDING,
      value: JSON.stringify({ completadoEn: Date.now() })
    })
  }

  /**
   * Punto de entrada desde app.vue. Se comprueba el estado real en cada arranque
   * (por si el usuario revirtió algo en Ajustes) pero el asistente solo se
   * muestra si nunca se completó: es una sola vez.
   */
  async function iniciar() {
    const guardado = await Preferences.get({ key: PREF_ONBOARDING })
    const previo = guardado.value ? JSON.parse(guardado.value) : {}
    const yaCompleto = !!previo.completadoEn || !!previo.pospuestoEn

    const actual = await evaluar()
    if (yaCompleto && actual !== 'listo') {
      paso.value = 'oculto'
    }
    return paso.value
  }

  /**
   * Al volver de Ajustes hay que reevaluar: el paso 1 solo puede resolverse
   * fuera de la app, así que es imposible saberlo al pedirlo.
   */
  function observarRegreso() {
    if (_resumeHook) return () => {}
    _resumeHook = true
    const handle = App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) evaluar().catch(() => {})
    })
    return () => {
      _resumeHook = null
      handle.then(h => h.remove()).catch(() => {})
    }
  }

  return {
    paso: readonly(paso),
    cargando: readonly(cargando),
    estadoSms: readonly(estadoSms),
    debeMostrar,
    evaluar,
    iniciar,
    desbloquear,
    pedirSms,
    pedirNotificaciones,
    posponer,
    completar,
    observarRegreso
  }
}
