import { computed, ref } from 'vue'
import { Preferences } from '@capacitor/preferences'
import { crearLexico, LEXICO_BASE, LEXICO_VERSION_SCHEMA } from '#shared/voz/lexico'
import { validarEntrada } from '#shared/schemas/vozLexico'

const KEY_ENTRIES = 'voz.lexico.entradas'
const KEY_VERSION = 'voz.lexico.version'

export function useVozLexico() {
  const entradas = ref([])
  const version = ref(0)
  const lexico = computed(() => {
    try {
      return crearLexico(LEXICO_BASE, entradas.value)
    } catch {
      return LEXICO_BASE
    }
  })

  async function cargarLocal() {
    try {
      const { value: e } = await Preferences.get({ key: KEY_ENTRIES })
      if (e) {
        const parsed = JSON.parse(e)
        if (Array.isArray(parsed)) entradas.value = parsed
      }
      const { value: v } = await Preferences.get({ key: KEY_VERSION })
      if (v) version.value = Number(v) || 0
    } catch {
      /* noop */
    }
  }

  async function persistir() {
    try {
      await Preferences.set({ key: KEY_ENTRIES, value: JSON.stringify(entradas.value) })
      await Preferences.set({ key: KEY_VERSION, value: String(version.value) })
    } catch {
      /* noop */
    }
  }

  async function refrescar(fetch) {
    if (typeof fetch !== 'function') {
      await cargarLocal()
      return
    }
    try {
      const resp = await fetch(`/api/voz/lexico?desde=${version.value}`, { method: 'GET' })
      if (!resp || resp.schema !== LEXICO_VERSION_SCHEMA) {
        await cargarLocal()
        return
      }
      // mezcla por `categoria|valor`
      const mapa = new Map()
      for (const e of (entradas.value || [])) {
        mapa.set(`${e.categoria}|${e.valor}`, { ...e })
      }
      for (const entrada of (resp.entradas || [])) {
        const key = `${entrada.categoria}|${entrada.valor}`
        if (entrada.activo === false) {
          mapa.delete(key)
        } else {
          mapa.set(key, entrada)
        }
      }
      entradas.value = Array.from(mapa.values())
      const nuevaVersion = Number(resp.version)
      if (Number.isFinite(nuevaVersion)) version.value = Math.max(version.value, nuevaVersion)
      await persistir()
    } catch {
      await cargarLocal()
    }
  }

  return { entradas, version, lexico, cargarLocal, refrescar, validarEntrada }
}
