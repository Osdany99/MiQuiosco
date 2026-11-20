import { computed, ref } from 'vue'
import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

import { motorParaServicio } from '#shared/voz/config'
import { $api, getApiBaseUrl } from '../utils/api'
import { API_ROUTES } from '../utils/api-paths'
import {
  estadoModelo,
  descargarModelo,
  importarModelo,
  borrarModelo,
  cancelarDescarga,
  escucharProgreso,
  marcarVersionModelo
} from '../utils/voice/modelo'
import { useVozConfig } from './useVozConfig'
import { useVozServicio } from './useVozServicio'

/**
 * useVozModelo — aprovisionamiento del modelo de voz offline (Vosk).
 *
 * El modelo (38 MB) ya no viaja dentro de la APK: se descarga una vez o se
 * importa desde un archivo. El disparador normal NO es el usuario, sino la
 * configuración de flota: cuando el super admin pone el motor Vosk para el
 * equipo, la app lo descubre al refrescar la configuración y se auto-aproviene.
 *
 * Si la descarga falla (red intermitente, servidor caído), NO se queda en un
 * solo intento: cada fallo deja un `proximoIntento` persistido con backoff
 * (1m → 5m → 15m → 1h) y se reintenta al arrancar, al volver a la app, al
 * recuperar la red y tras cada sync. Mientras tanto la voz cerrada usa el
 * reconocedor del sistema y el panel de admin lo ve (`vozVosk: false`).
 *
 * Estado de módulo: el aviso vive en Ajustes y en el arranque del layout, y con
 * refs por llamada cada uno vería un estado distinto.
 */

const PREF_INTENTOS = 'voz.modelo.intentos'
const PREF_PROXIMO = 'voz.modelo.proximo'

const ESPERAS_MIN = [1, 5, 15, 60]
const MANIFIESTO_TTL_MS = 5 * 60 * 1000

/** 'desconocido' | 'listo' | 'pendiente' | 'descargando' | 'preparando' | 'error' */
const estado = ref('desconocido')
const progreso = ref({ fase: '', pct: 0, bytes: 0, total: 0 })
const error = ref(null)
const version = ref('')
const intentos = ref(0)
const proximoIntento = ref(0)

let enCurso = null
let soltarProgreso = null
let manifiestoCache = { at: 0, valor: null }

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

function aplicarEstadoNativo(res) {
  if (!res) return
  version.value = res.version ? String(res.version) : ''
  estado.value = res.listo ? 'listo' : 'pendiente'
}

function esperaTrasFallo(n) {
  const minutos = ESPERAS_MIN[Math.min(n, ESPERAS_MIN.length - 1)] ?? 60
  return Date.now() + minutos * 60 * 1000
}

async function registrarFallo() {
  intentos.value += 1
  proximoIntento.value = esperaTrasFallo(intentos.value - 1)
  await guardarNumero(PREF_INTENTOS, intentos.value)
  await guardarNumero(PREF_PROXIMO, proximoIntento.value)
}

async function limpiarReintentos() {
  intentos.value = 0
  proximoIntento.value = 0
  error.value = null
  await guardarNumero(PREF_INTENTOS, 0)
  await guardarNumero(PREF_PROXIMO, 0)
}

async function absolutizarUrl(url) {
  if (/^https?:\/\//i.test(url)) return url
  const base = (await getApiBaseUrl()) || ''
  return `${base.replace(/\/+$/, '')}/${String(url).replace(/^\/+/, '')}`
}

/**
 * Manifiesto de versiones con caché corta: el arranque, el sync y Ajustes
 * preguntan por el modelo y no tiene sentido pedirlo tres veces seguidas.
 */
async function leerManifiesto({ forzar = false } = {}) {
  if (!forzar && manifiestoCache.valor && Date.now() - manifiestoCache.at < MANIFIESTO_TTL_MS) {
    return manifiestoCache.valor
  }
  const respuesta = await $api(API_ROUTES.appVersion)
  const modelo = respuesta?.vozModelo ?? {}
  manifiestoCache = { at: Date.now(), valor: modelo }
  return modelo
}

/** Traduce las fases nativas a los estados que pinta la UI. */
function aplicarProgreso(p) {
  const fase = String(p?.fase ?? '')
  progreso.value = {
    fase,
    pct: Math.max(0, Math.min(100, Number(p?.pct) || 0)),
    bytes: Number(p?.bytes) || 0,
    total: Number(p?.total) || 0
  }
  if (fase === 'descargando') estado.value = 'descargando'
  else if (fase === 'listo') estado.value = 'listo'
  else if (fase) estado.value = 'preparando'
}

async function suscribirProgreso() {
  if (soltarProgreso) return
  soltarProgreso = await escucharProgreso(aplicarProgreso)
}

/** Relee el estado real del dispositivo (modelo ya extraído o no). */
async function refrescar() {
  if (!esNativo()) {
    estado.value = 'pendiente'
    return estado.value
  }
  const res = await estadoModelo()
  aplicarEstadoNativo(res)
  intentos.value = await leerNumero(PREF_INTENTOS)
  proximoIntento.value = await leerNumero(PREF_PROXIMO)
  return estado.value
}

/**
 * Descarga el modelo si el manifiesto lo publica. Reanudable: si hay un
 * `.part` de un intento anterior, el nativo lo continúa.
 */
async function descargar() {
  if (!esNativo()) return false
  if (enCurso) return enCurso

  enCurso = (async () => {
    error.value = null
    progreso.value = { fase: '', pct: 0, bytes: 0, total: 0 }
    estado.value = 'descargando'

    try {
      // El manifiesto se pide aparte: un fallo de red aquí NO es un fallo del
      // modelo, así que no consume reintentos ni pinta un error al usuario.
      let remoto
      try {
        remoto = await leerManifiesto({ forzar: true })
      } catch {
        estado.value = 'pendiente'
        return false
      }
      if (!remoto?.url) {
        error.value = 'El modelo de voz todavía no está publicado en el servidor.'
        estado.value = 'error'
        return false
      }

      try {
        const url = await absolutizarUrl(remoto.url)
        await suscribirProgreso()
        const res = await descargarModelo({
          url,
          sha256: remoto.sha256,
          bytes: remoto.bytes,
          version: remoto.version
        })
        aplicarEstadoNativo(res)
        if (estado.value !== 'listo') {
          // El ZIP quedó instalado pero la extracción no terminó: se reintenta en
          // el próximo arranque en vez de dar por bueno un modelo a medias.
          estado.value = 'pendiente'
          throw new Error('El modelo se descargó pero no se pudo descomprimir.')
        }
        await limpiarReintentos()
        await refrescar()
        await aplicarAlServicio()
        return true
      } catch (e) {
        const cancelado = e?.code === 'CANCELADO' || /cancelada/i.test(e?.message ?? '')
        if (cancelado) {
          estado.value = 'pendiente'
          error.value = null
          return false
        }
        error.value = e?.message || 'No se pudo descargar el modelo de voz.'
        estado.value = 'error'
        await registrarFallo()
        return false
      }
    } finally {
      enCurso = null
      if (soltarProgreso) {
        soltarProgreso()
        soltarProgreso = null
      }
    }
  })()

  return enCurso
}

/**
 * Reinicia el servicio de escucha tras instalar el modelo: `voskFalloTodo` vive
 * por sesión del servicio, así que sin reiniciarlo seguiría usando el sistema
 * hasta el próximo arranque de la app.
 */
async function aplicarAlServicio() {
  const servicio = useVozServicio()
  try {
    await servicio.refrescar()
    if (!servicio.preferencia.value) return
    await servicio.detener()
    await servicio.iniciar({ pausado: true })
  } catch {
    /* el próximo arranque de la app lo recoge */
  }
}

/**
 * Punto de entrada automático: solo descarga si la configuración del equipo
 * pide Vosk y el modelo no está listo. Respeta el backoff salvo `forzar`.
 */
async function quizasAprovisionar({ forzar = false } = {}) {
  if (!esNativo() || enCurso) return false

  let cfg
  try {
    cfg = await useVozConfig().cargar()
  } catch {
    return false
  }
  if (motorParaServicio(cfg?.motor) !== 'vosk') return false

  if (estado.value === 'desconocido' || forzar) await refrescar()

  if (estado.value === 'listo') {
    // El modelo también puede cambiar (release modelo-vosk-vN). Se compara la
    // versión instalada con la del manifiesto; si el equipo venía de la APK
    // vieja (sin versión anotada) se adopta sin volver a descargar 38 MB.
    let remoto = null
    try {
      remoto = await leerManifiesto()
    } catch {
      return true
    }
    const remota = remoto?.version ? String(remoto.version) : ''
    if (!remota || !remoto?.url || remota === version.value) return true
    if (!version.value) {
      await marcarVersionModelo(remota)
      version.value = remota
      return true
    }
  }

  if (!forzar) {
    const proximo = proximoIntento.value || await leerNumero(PREF_PROXIMO)
    if (proximo && Date.now() < proximo) return false
  }
  return descargar()
}

/** Botón de Ajustes: ignora el backoff y vuelve a intentar ya. */
function reintentar() {
  return descargar()
}

/** Importa el ZIP desde USB/SD (equipos sin red). */
async function importar() {
  if (!esNativo() || enCurso) return false
  error.value = null
  await suscribirProgreso()
  try {
    const res = await importarModelo()
    aplicarEstadoNativo(res)
    if (estado.value !== 'listo') {
      throw new Error('El archivo se copió pero no se pudo descomprimir.')
    }
    await limpiarReintentos()
    await refrescar()
    await aplicarAlServicio()
    return true
  } catch (e) {
    const cancelado = e?.code === 'CANCELADO' || /cancelada/i.test(e?.message ?? '')
    if (!cancelado) error.value = e?.message || 'No se pudo importar el modelo.'
    return false
  } finally {
    if (soltarProgreso) {
      soltarProgreso()
      soltarProgreso = null
    }
  }
}

/** Soporte: libera los ~40 MB del modelo y deja el equipo sin Vosk. */
async function borrar() {
  const res = await borrarModelo()
  aplicarEstadoNativo(res)
  estado.value = 'pendiente'
  await limpiarReintentos()
  return true
}

function cancelar() {
  return cancelarDescarga()
}

export function useVozModelo() {
  return {
    estado,
    progreso,
    error,
    version,
    intentos,
    proximoIntento,
    descargando: computed(() => estado.value === 'descargando' || estado.value === 'preparando'),
    listo: computed(() => estado.value === 'listo'),
    esNativo,
    refrescar,
    quizasAprovisionar,
    descargar,
    reintentar,
    importar,
    borrar,
    cancelar
  }
}
