/**
 * app/utils/voice/proofs.js — Auditoría local del Modo PRO.
 *
 * Guarda un registro por cada intento de auto-confirmación: qué se entendió,
 * qué producto/ubicación y si terminó en venta o se abandonó. No guarda audio
 * ni texto crudo de voz. Se conserva en Preferences (nativo) con fallback a
 * localStorage (web) para no perderlo al recargar.
 */
import { Preferences } from '@capacitor/preferences'
import { getApiBaseUrl } from '../utils/api'

const KEY = 'voice.proofs'
const MAX = 50

function leerLocal() {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function leerPreferencias() {
  try {
    const { value } = await Preferences.get({ key: KEY })
    if (!value) return []
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function leerProofs() {
  const enPreferencias = await leerPreferencias()
  if (enPreferencias.length) return enPreferencias
  return leerLocal()
}

/**
 * @param {object} proof Datos estructurados del intento (sin texto crudo).
 * @returns {Promise<object|null>} El registro guardado, o null si no se pudo.
 */
async function subirProof(proof) {
  // Auditoría central best-effort: si no hay red o el servidor falla, no se
  // bloquea (el proof ya quedó guardado localmente).
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    const baseUrl = await getApiBaseUrl()
    const url = `${baseUrl || ''}/api/voz/confirmaciones`
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(proof)
    })
  } catch {
    /* noop: auditoría central opcional */
  }
}

export async function registrarProof(proof) {
  if (!proof || typeof proof !== 'object') return null
  const item = { ts: new Date().toISOString(), ...proof }
  const previos = await leerProofs()
  const recorte = [...previos, item].slice(-MAX)
  try {
    await Preferences.set({ key: KEY, value: JSON.stringify(recorte) })
  } catch {
    /* noop */
  }
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(recorte))
  } catch {
    /* noop */
  }
  void subirProof(item)
  return item
}
