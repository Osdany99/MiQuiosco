import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { TABLES } from '../../shared/tables'
import { useAuth } from './useAuth'
import { useInventario } from './useInventario'
import { useAccionesPendientes } from './useAccionesPendientes'
import { useLocalRepo } from './useLocalRepo'
import { useModoConexion } from './useModoConexion'
import { useRemoteRepo } from './useRemoteRepo'
import { useVozLexico } from './useVozLexico'
import { construirSnapshot, inicioDelDia } from '../utils/voice/snapshot'
import { resumirDia } from '#shared/voz/dia'

/**
 * useVozSnapshot — deja una foto del catálogo para que el servicio en primer
 * plano pueda responder consultas con la app cerrada.
 *
 * El servicio nativo NO calcula stock ni toca la base: solo lee
 * `files/voz/snapshot.json` y habla. Todo lo que hay aquí es de solo lectura.
 */

const RUTA = 'voz/snapshot.json'
const DIRECTORIO = 'voz'

export function useVozSnapshot() {
  const auth = useAuth()
  const inv = useInventario()
  const acciones = useAccionesPendientes()
  const conexion = useModoConexion()
  const vozLexico = useVozLexico()
  const ventasRepo = computed(() => (
    conexion.modo.value === 'online'
      ? useRemoteRepo(TABLES.ventas_directas)
      : useLocalRepo(TABLES.ventas_directas)
  ))
  const cuentasRepo = computed(() => (
    conexion.modo.value === 'online'
      ? useRemoteRepo(TABLES.cuentas_fiado)
      : useLocalRepo(TABLES.cuentas_fiado)
  ))
  const clientesRepo = computed(() => (
    conexion.modo.value === 'online'
      ? useRemoteRepo(TABLES.clientes)
      : useLocalRepo(TABLES.clientes)
  ))
  const cuadresRepo = computed(() => (
    conexion.modo.value === 'online'
      ? useRemoteRepo(TABLES.cuadres)
      : useLocalRepo(TABLES.cuadres)
  ))

  // Solo puede haber una escritura en vuelo: dos pantallas montando a la vez
  // no deben pisarse el fichero.
  let enCurso = null

  async function construir(ahora = Date.now()) {
    const puestoId = auth.usuarioActual.value?.puestoId ?? null
    if (!puestoId) return null

    const [filas, ventas, cuentas, clientes] = await Promise.all([
      inv.cargarSaldos().catch(() => []),
      ventasRepo.value
        .readAll({ query: { desde: new Date(inicioDelDia(ahora)).toISOString() } })
        .catch(() => []),
      cuentasRepo.value.readAll().catch(() => []),
      clientesRepo.value.readAll().catch(() => [])
    ])
    await acciones.cargar().catch(() => {})

    const snapshot = construirSnapshot({
      puestoId,
      filas: filas ?? [],
      acciones: acciones.pendientes.value,
      ventas: ventas ?? [],
      cuentas: cuentas ?? [],
      clientes: clientes ?? [],
      lexico: vozLexico.lexico.value,
      ahora
    })

    // Ganancia con la app cerrada (P3.5): el servicio nativo lee
    // `resumen.gananciaHoy`, que aquí sale solo de las ventas directas. Con un
    // cuadre CERRADO de hoy esa cifra no es la del cuadre y no cuadraría con la
    // que responde la app abierta ni con la gráfica. Mientras el cálculo por
    // cuadre no exista en Java, se quita el campo: el servicio contesta «Abre la
    // app para ver la ganancia», que es la verdad. Sin cuadre cerrado la cifra
    // fuera de cuadre sí es correcta y se conserva.
    const hayCuadreCerrado = await hayCuadreCerradoHoy(puestoId, ahora).catch(() => false)
    if (hayCuadreCerrado && snapshot?.resumen) delete snapshot.resumen.gananciaHoy

    return snapshot
  }

  /** ¿Cerró hoy el cuadre de este puesto? Solo lectura, para la foto de voz. */
  async function hayCuadreCerradoHoy(puestoId, ahora = Date.now()) {
    const res = await cuadresRepo.value.readAll()
    const filas = Array.isArray(res) ? res : (res?.data ?? [])
    const dia = new Date(inicioDelDia(ahora))
    const iso = `${dia.getFullYear()}-${String(dia.getMonth() + 1).padStart(2, '0')}-${String(dia.getDate()).padStart(2, '0')}`
    return (filas ?? []).some(c => c?.estado === 'cerrado'
      && String(c?.fecha ?? '') === iso
      && (!puestoId || !c?.puestoId || c.puestoId === puestoId))
  }

  /**
   * Reescribe el snapshot. Silencioso a propósito: si el teléfono no deja
   * escribir (web, permisos), la voz sigue funcionando con la app abierta.
   * @returns {Promise<object|null>} el snapshot escrito, o null.
   */
  async function actualizar({ ahora = Date.now() } = {}) {
    if (!Capacitor.isNativePlatform()) return null
    if (enCurso) return enCurso

    enCurso = (async () => {
      const snapshot = await construir(ahora)
      if (!snapshot) return null
      try {
        await Filesystem.mkdir({ path: DIRECTORIO, directory: Directory.Data, recursive: true })
          .catch(() => {})
        await Filesystem.writeFile({
          path: RUTA,
          data: JSON.stringify(snapshot),
          directory: Directory.Data,
          encoding: Encoding.UTF8,
          recursive: true
        })
        return snapshot
      } catch {
        return null
      }
    })().finally(() => { enCurso = null })

    return enCurso
  }

  /** Lee lo último escrito (diagnóstico desde /pendientes). */
  async function leer() {
    if (!Capacitor.isNativePlatform()) return null
    try {
      const res = await Filesystem.readFile({
        path: RUTA,
        directory: Directory.Data,
        encoding: Encoding.UTF8
      })
      return JSON.parse(String(res?.data ?? '{}'))
    } catch {
      return null
    }
  }

  /**
   * Resumen del día para la consulta por voz con la app abierta.
   * Lee las mismas fuentes que el snapshot (ventas del día y cola de revisión)
   * pero SIN cargar el catálogo: preguntar «cómo va el día» no debe recorrer el
   * inventario entero.
   */
  async function resumenDelDia(ahora = Date.now()) {
    const [ventas, dictados] = await Promise.all([
      ventasRepo.value
        .readAll({ query: { desde: new Date(inicioDelDia(ahora)).toISOString() } })
        .catch(() => []),
      // Lo dictado con la app cerrada aún no está en la cola: el servicio lo
      // cuenta para no mentir y aquí se hace igual.
      contarDictadosEnBuzon()
    ])
    await acciones.cargar().catch(() => {})
    return resumirDia({
      ventas: ventas ?? [],
      acciones: acciones.pendientes.value,
      dictados,
      ahora
    })
  }

  /** Dictados del servicio que todavía no ha recogido la app. */
  async function contarDictadosEnBuzon() {
    if (!Capacitor.isNativePlatform()) return 0
    try {
      const listado = await Filesystem.readdir({ path: 'voz/inbox', directory: Directory.Data })
      return (listado?.files ?? [])
        .map(f => (typeof f === 'string' ? f : f?.name))
        .filter(n => typeof n === 'string' && n.endsWith('.json'))
        .length
    } catch {
      return 0
    }
  }

  return { actualizar, leer, construir, resumenDelDia }
}
