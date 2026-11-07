import { ref } from 'vue'
import { Preferences } from '@capacitor/preferences'
import { useAuth } from './useAuth'
import { resolverClave, estadoCompleto, estadoAOverrides, claveVista, claveAccion, claveDato, claveVenta, normalizarOverrides } from '#shared/permisos'

const PREF_PERMISOS = 'permisos_puesto'

// Estado compartido a nivel de módulo, como useSync.
const overrides = ref({})
const puestoId = ref(null)
let cargado = false

async function cargarDesdePreferencias() {
  const auth = useAuth()
  const actual = auth.usuarioActual.value?.puestoId || ''
  try {
    const { value } = await Preferences.get({ key: PREF_PERMISOS })
    if (value) {
      const sesion = JSON.parse(value)
      if (sesion && sesion.puestoId === actual && sesion.permisos) {
        puestoId.value = sesion.puestoId
        overrides.value = normalizarOverrides(sesion.permisos)
        cargado = true
        return
      }
    }
  } catch {
    // Ignora: se queda con lo que haya.
  }
  // Si no coincide puesto o no hay datos: limpiar.
  puestoId.value = actual || null
  overrides.value = {}
  cargado = true
}

async function guardarDesdePuesto(puesto) {
  const auth = useAuth()
  const actual = auth.usuarioActual.value?.puestoId || puesto?.id || ''
  const perms = (puesto && puesto.permisos) ? puesto.permisos : {}
  const norm = normalizarOverrides(perms)
  puestoId.value = actual
  overrides.value = norm
  try {
    await Preferences.set({
      key: PREF_PERMISOS,
      value: JSON.stringify({ puestoId: actual, permisos: norm, actualizadoEn: Date.now() })
    })
  } catch {
    // sin persistencia, aplica solo esta sesión
  }
}

function puede(clave) {
  const auth = useAuth()
  const actual = auth.usuarioActual.value?.puestoId || ''
  if (actual && puestoId.value && actual !== puestoId.value) return true // fail-open
  return resolverClave(clave, overrides.value)
}

function puedeVista(vista) {
  return puede(claveVista(vista))
}

function puedeAccion(vista, accion) {
  return puede(claveAccion(vista, accion))
}

function puedeDato(dato) {
  return puede(claveDato(dato))
}

function puedeVenta(modalidad) {
  return puede(claveVenta(modalidad))
}

function estado() {
  return estadoCompleto(overrides.value)
}

function establecerEstado(nuevoEstado) {
  overrides.value = normalizarOverrides(estadoAOverrides(nuevoEstado))
  guardarDesdePuesto({ id: puestoId.value, permisos: overrides.value })
}

function limpiar() {
  puestoId.value = null
  overrides.value = {}
  Preferences.remove({ key: PREF_PERMISOS }).catch(() => {})
}

export function usePermisos() {
  return {
    overrides,
    puestoId,
    cargado,
    cargarDesdePreferencias,
    guardarDesdePuesto,
    puede,
    puedeVista,
    puedeAccion,
    puedeDato,
    puedeVenta,
    estado,
    establecerEstado,
    limpiar,
    claveVista,
    claveAccion,
    claveDato,
    claveVenta
  }
}
