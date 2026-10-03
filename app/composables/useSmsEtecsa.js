/**
 * useSmsEtecsa - Estado compartido del subsistema de SMS de Etecsa.
 *
 * Responsabilidad: mantener una sola copia de "qué SMS han llegado" para toda
 * la app, y avisar a quien quiera escucharlo. El parseo y el registro de
 * recargas (Fase 1) se enganchan aquí después; por ahora esta capa solo mueve
 * los mensajes crudos desde el plugin nativo.
 *
 * El estado es a scope de módulo (fuera de la función) por el mismo motivo que
 * en useAppUpdate: varias pantallas y composables llaman a useSmsEtcsa() y con
 * refs propias cada una vería una cola distinta.
 */
import { App } from '@capacitor/app'
import {
  smsEstado,
  smsLeerPendientes,
  smsVerPendientes,
  smsBarrerBuzon,
  smsLimpiar,
  smsSetRemitentes,
  smsPedirPermisoRecibir
} from '../utils/sms'

const mensajes = ref([])
const estado = ref({
  disponible: false,
  permisoRecibir: false,
  permisoLeer: false,
  remitentes: [],
  pendientes: 0
})
const cargando = ref(false)

let _resumeHook = null

export function useSmsEtecsa() {
  /**
   * Lee la cola del plugin y la acumula en `mensajes`.
   * @param {object} [opts]
   * @param {boolean} [opts.drenar=true] si es false solo mira sin vaciar.
   */
  async function cargar({ drenar = true } = {}) {
    cargando.value = true
    try {
      const st = await smsEstado()
      estado.value = st
      if (!st.disponible) return []

      const res = drenar
        ? await smsLeerPendientes()
        : await smsVerPendientes()

      if (res.mensajes?.length) {
        // Drenar vacía la cola, pero la app puede haber leído los mismos
        // mensajes en otro momento (p.ej. tras un reinicio del WebView sin
        // reinicio de proceso). El hash evita duplicarlos en la vista.
        const vistos = new Set(mensajes.value.map(m => m.hash).filter(Boolean))
        const nuevos = res.mensajes.filter(m => !m.hash || !vistos.has(m.hash))
        mensajes.value = [...nuevos, ...mensajes.value]
      }
      return res.mensajes || []
    } finally {
      cargando.value = false
    }
  }

  /** Recarga permisos/tamaño de cola sin tocar la lista mostrada. */
  async function refrescarEstado() {
    estado.value = await smsEstado()
    return estado.value
  }

  /**
   * Capa 3: barre el buzón del sistema. Complementa al BroadcastReceiver para
   * el caso en que este no se ejecutó. `desde` en milisegundos.
   */
  async function barrer({ desde = 0 } = {}) {
    const res = await smsBarrerBuzon({ desde })
    if (res.permisoRequerido) return { mensajes: [], permisoRequerido: true }
    return { mensajes: res.mensajes || [], permisoRequerido: false }
  }

  async function pedirPermiso() {
    const ok = await smsPedirPermisoRecibir()
    await refrescarEstado()
    return ok
  }

  async function guardarRemitentes(lista) {
    const ok = await smsSetRemitentes(lista)
    await refrescarEstado()
    return ok
  }

  async function limpiarCola() {
    await smsLimpiar()
    mensajes.value = []
    await refrescarEstado()
  }

  function reiniciar() {
    mensajes.value = []
    estado.value = { ...estado.value, pendientes: 0 }
  }

  /**
   * Registra un hook único que recarga al volver a primer plano. Es el momento
   * clave: si el proceso estuvo muerto, la cola nativa tiene lo que se perdió
   * mientras tanto.
   */
  function observarResume() {
    if (_resumeHook) return () => {}
    _resumeHook = true
    const handle = App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) cargar().catch(() => {})
    })
    return () => {
      _resumeHook = null
      handle.then(h => h.remove()).catch(() => {})
    }
  }

  return {
    mensajes: readonly(mensajes),
    estado: readonly(estado),
    cargando: readonly(cargando),
    cargar,
    refrescarEstado,
    barrer,
    pedirPermiso,
    guardarRemitentes,
    limpiarCola,
    reiniciar,
    observarResume
  }
}
