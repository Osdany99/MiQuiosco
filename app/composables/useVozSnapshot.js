import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { TABLES } from '../../shared/tables'
import { useAuth } from './useAuth'
import { useInventario } from './useInventario'
import { useAccionesPendientes } from './useAccionesPendientes'
import { useLocalRepo } from './useLocalRepo'
import { useModoConexion } from './useModoConexion'
import { useRemoteRepo } from './useRemoteRepo'
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

    return construirSnapshot({
      puestoId,
      filas: filas ?? [],
      acciones: acciones.pendientes.value,
      ventas: ventas ?? [],
      cuentas: cuentas ?? [],
      clientes: clientes ?? [],
      ahora
    })
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
    const [ventas] = await Promise.all([
      ventasRepo.value
        .readAll({ query: { desde: new Date(inicioDelDia(ahora)).toISOString() } })
        .catch(() => [])
    ])
    await acciones.cargar().catch(() => {})
    return resumirDia({
      ventas: ventas ?? [],
      acciones: acciones.pendientes.value,
      ahora
    })
  }

  return { actualizar, leer, construir, resumenDelDia }
}
