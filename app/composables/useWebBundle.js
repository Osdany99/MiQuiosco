import { computed, ref } from 'vue'
import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

import { ACCION, decidirBundle, otaObsoleto } from '#shared/web/bundle'
import { getAppVersionCode } from '../utils/api'
import { leerManifiesto } from '../utils/manifiesto'
import {
  estadoBundle,
  descargarBundle,
  activarBundle,
  aplicarBundleAhora,
  volverAlBundleDeLaApk,
  confirmarBundleListo,
  limpiarBundles,
  cancelarDescargaBundle,
  escucharProgresoBundle
} from '../utils/webBundle'

/**
 * useWebBundle — actualiza el bundle web (HTML/JS/CSS, ~1 MB comprimido) sin
 * instalar APK.
 *
 * La comparación de versiones vive en `shared/web/bundle.js` (puro y probado).
 * Aquí solo se orquesta: leer el manifiesto, descargar, activar y confirmar el
 * arranque. La activación es para el SIGUIENTE arranque: recargar la WebView en
 * mitad de una venta sería peor que esperar. `aplicarAhora()` existe para el
 * botón de Ajustes.
 *
 * Si el bundle no arranca, el watchdog nativo (`WebBundle.arrancar`) vuelve al
 * de la APK a los 3 intentos y lo marca como fallido; esta capa no lo vuelve a
 * descargar.
 *
 * Estado de módulo: el aviso vive en Ajustes y en el arranque del layout, y con
 * refs por llamada cada uno vería un estado distinto.
 */

const PREF_INTENTOS = 'web.intentos'
const PREF_PROXIMO = 'web.proximo'
const ESPERAS_MIN = [1, 5, 15, 60]

/** 'desconocido' | 'al-dia' | 'descargando' | 'listo' | 'apk-primero' | 'sin-manifiesto' | 'error' */
const estado = ref('desconocido')
const progreso = ref({ fase: '', pct: 0, bytes: 0, total: 0 })
const error = ref(null)
/** versionCode del bundle que está corriendo (APK u OTA). */
const enEjecucion = ref(0)
/** versionCode del bundle persistido (puede estar esperando reinicio). */
const persistida = ref(0)
/** versionCode de la APK instalada (la que trae el bundle de fábrica). */
const embebida = ref(0)
const fallida = ref(0)
const versionRemota = ref(0)
const intentos = ref(0)
const proximoIntento = ref(0)

let enCurso = null
let soltarProgreso = null

function esNativo() {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

async function leerNumero(clave) {
  try {
    const { value } = await Preferences.get({ key: clave })
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
  } catch {
    return 0
  }
}

async function guardarNumero(clave, valor) {
  try {
    await Preferences.set({ key: clave, value: String(valor) })
  } catch {
    /* preferencias no disponibles */
  }
}

async function limpiarReintentos() {
  intentos.value = 0
  proximoIntento.value = 0
  await guardarNumero(PREF_INTENTOS, 0)
  await guardarNumero(PREF_PROXIMO, 0)
}

async function registrarFallo() {
  intentos.value += 1
  const minutos = ESPERAS_MIN[Math.min(intentos.value - 1, ESPERAS_MIN.length - 1)] ?? 60
  proximoIntento.value = Date.now() + minutos * 60 * 1000
  await guardarNumero(PREF_INTENTOS, intentos.value)
  await guardarNumero(PREF_PROXIMO, proximoIntento.value)
}

function aplicarEstadoNativo(res) {
  if (!res) return
  persistida.value = res.activa
  fallida.value = res.fallida
}

/** Relee el estado del dispositivo (bundle activo y carpetas descargadas). */
async function refrescar() {
  if (!esNativo()) {
    estado.value = 'al-dia'
    return estado.value
  }
  aplicarEstadoNativo(await estadoBundle())
  if (!embebida.value) embebida.value = (await getAppVersionCode()) ?? 0
  if (!enEjecucion.value) enEjecucion.value = persistida.value || embebida.value
  return estado.value
}

/**
 * Confirma el arranque (para el watchdog) y limpia bundles viejos.
 * Se llama una vez al montar el layout.
 */
async function listo() {
  if (!esNativo()) return 0
  const activa = await confirmarBundleListo()
  enEjecucion.value = activa || (await getAppVersionCode()) || 0
  persistida.value = activa
  embebida.value = (await getAppVersionCode()) ?? 0
  // Solo hace falta la versión en uso: la anterior se puede volver a bajar.
  void limpiarBundles(activa).then(aplicarEstadoNativo).catch(() => {})
  return enEjecucion.value
}

async function suscribirProgreso() {
  if (soltarProgreso) return
  soltarProgreso = await escucharProgresoBundle((p) => {
    const fase = String(p?.fase ?? '')
    progreso.value = {
      fase,
      pct: Math.max(0, Math.min(100, Number(p?.pct) || 0)),
      bytes: Number(p?.bytes) || 0,
      total: Number(p?.total) || 0
    }
    if (fase === 'descargando' || fase === 'verificando' || fase === 'instalando') {
      estado.value = 'descargando'
    }
  })
}

function soltar() {
  if (soltarProgreso) {
    soltarProgreso()
    soltarProgreso = null
  }
}

/**
 * Descarga y deja activado el bundle para el próximo arranque.
 * `forzar` ignora el backoff (botón de Ajustes).
 */
async function descargar({ forzar = false } = {}) {
  if (!esNativo()) return false
  if (enCurso) return enCurso

  enCurso = (async () => {
    error.value = null
    progreso.value = { fase: '', pct: 0, bytes: 0, total: 0 }

    try {
      let remoto
      try {
        remoto = (await leerManifiesto({ forzar: true }))?.web ?? {}
      } catch {
        // Sin red: no es un fallo del bundle, no gasta reintentos.
        estado.value = 'sin-manifiesto'
        return false
      }
      const decision = decidirBundle({
        embebida: embebida.value,
        instalada: Math.max(persistida.value, enEjecucion.value),
        fallida: fallida.value,
        remoto
      })
      versionRemota.value = decision.version
      if (decision.accion !== ACCION.DESCARGAR) {
        estado.value = decision.accion === ACCION.APK_PRIMERO ? 'apk-primero' : 'al-dia'
        return false
      }
      if (!forzar) {
        const proximo = proximoIntento.value || await leerNumero(PREF_PROXIMO)
        if (proximo && Date.now() < proximo) return false
      }

      estado.value = 'descargando'
      await suscribirProgreso()
      const res = await descargarBundle({
        url: remoto.url,
        sha256: remoto.sha256,
        bytes: remoto.bytes,
        version: decision.version
      })
      aplicarEstadoNativo(res)
      // `activar` solo persiste la ruta: se aplica al siguiente arranque.
      aplicarEstadoNativo(await activarBundle(decision.version))
      await limpiarReintentos()
      estado.value = 'listo'
      return true
    } catch (e) {
      const cancelado = e?.code === 'CANCELADO' || /cancelada/i.test(e?.message ?? '')
      if (cancelado) {
        estado.value = 'al-dia'
        error.value = null
        return false
      }
      error.value = e?.message || 'No se pudo descargar la actualización.'
      estado.value = 'error'
      await registrarFallo()
      return false
    } finally {
      enCurso = null
      soltar()
    }
  })()

  return enCurso
}

/**
 * Punto de entrada automático: mira el manifiesto y, si hay un bundle más nuevo
 * compatible, lo descarga y lo deja para el próximo arranque.
 */
async function quizasActualizar({ forzar = false } = {}) {
  if (!esNativo() || enCurso) return false
  if (estado.value === 'desconocido' || forzar) await refrescar()
  if (!embebida.value) embebida.value = (await getAppVersionCode()) ?? 0

  let remoto
  try {
    remoto = (await leerManifiesto())?.web ?? {}
  } catch {
    return false
  }

  const used = Math.max(persistida.value, enEjecucion.value)
  const decision = decidirBundle({
    embebida: embebida.value,
    instalada: used,
    fallida: fallida.value,
    remoto
  })
  versionRemota.value = decision.version

  if (decision.accion === ACCION.APK_PRIMERO) {
    estado.value = 'apk-primero'
    return false
  }
  if (decision.accion === ACCION.NADA) {
    estado.value = 'al-dia'
    // Una APK nueva deja obsoleto el bundle OTA: se borra para no arrastrarlo.
    if (otaObsoleto({ embebida: embebida.value, instalada: persistida.value })) {
      void limpiarBundles(0).then(aplicarEstadoNativo).catch(() => {})
    }
    return false
  }
  return descargar()
}

/** Botón de Ajustes: reintenta ya, sin esperar el backoff. */
function descargarAhora() {
  return descargar({ forzar: true })
}

/** Botón «Reiniciar ahora»: aplica y recarga. */
async function aplicarAhora() {
  if (!esNativo()) return false
  const version = persistida.value || versionRemota.value
  if (!version) return false
  try {
    await aplicarBundleAhora(version)
    return true
  } catch (e) {
    error.value = e?.message || 'No se pudo aplicar la actualización.'
    return false
  }
}

/** Soporte: vuelve al bundle que viene dentro de la APK. */
async function volverAApk() {
  if (!esNativo()) return false
  try {
    await volverAlBundleDeLaApk()
    enEjecucion.value = embebida.value
    persistida.value = 0
    estado.value = 'al-dia'
    return true
  } catch (e) {
    error.value = e?.message || 'No se pudo volver al bundle de la app.'
    return false
  }
}

function cancelar() {
  return cancelarDescargaBundle()
}

export function useWebBundle() {
  return {
    estado,
    progreso,
    error,
    enEjecucion,
    persistida,
    embebida,
    fallida,
    versionRemota,
    intentos,
    proximoIntento,
    descargando: computed(() => estado.value === 'descargando'),
    pendienteReinicio: computed(() => persistida.value > enEjecucion.value && persistida.value > 0),
    versionEnUso: computed(() => enEjecucion.value || embebida.value || 0),
    esNativo,
    refrescar,
    listo,
    quizasActualizar,
    descargarAhora,
    aplicarAhora,
    volverAApk,
    cancelar
  }
}
