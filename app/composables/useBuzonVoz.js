import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { useAccionesPendientes } from './useAccionesPendientes'
import { useAuth } from './useAuth'
import { useVentaPorVoz } from './useVentaPorVoz'
import { normalizarEntradaBuzon, pendienteDesdeAccion, pendienteResuelto } from '../utils/voice/buzon'

/**
 * useBuzonVoz — recoge lo que dictó el servicio en primer plano.
 *
 * Con la app cerrada el servicio solo puede escuchar y escribir el texto en
 * `files/voz/inbox/*.json`. Al abrir la app (o al volver a ella) se drena ese
 * buzón: cada entrada se interpreta con el MISMO resolvedor que usa la voz con
 * la app abierta y, si es un movimiento de datos, se guarda como acción
 * pendiente de revisión.
 *
 * El fichero se borra solo cuando la acción quedó guardada (o cuando no era una
 * venta). Si la interpretación falla, se deja para el siguiente intento.
 */

const DIRECTORIO = 'voz/inbox'
/** Reservas de stock que dejó el servicio con cada dictado anotado. */
const RUTA_RESERVAS = 'voz/reservas.json'
const MAX_POR_DRENAJE = 40

let enCurso = null

export function useBuzonVoz() {
  const auth = useAuth()
  const acciones = useAccionesPendientes()
  const vozQuiosco = useVentaPorVoz('quiosco')
  const vozAlmacen = useVentaPorVoz('almacen')

  const esNativo = (() => {
    try {
      return Capacitor.isNativePlatform()
    } catch {
      return false
    }
  })()

  async function leerEntrada(nombre) {
    try {
      const res = await Filesystem.readFile({
        path: `${DIRECTORIO}/${nombre}`,
        directory: Directory.Data,
        encoding: Encoding.UTF8
      })
      return JSON.parse(String(res?.data ?? '{}'))
    } catch {
      return null
    }
  }

  async function borrarEntrada(nombre) {
    await Filesystem.deleteFile({ path: `${DIRECTORIO}/${nombre}`, directory: Directory.Data })
      .catch(() => {})
  }

  /**
   * Interpreta una entrada y guarda la acción pendiente.
   * @returns {'creada'|'duplicada'|'ignorada'|'invalida'}
   */
  async function procesarEntrada(nombre) {
    const datos = await leerEntrada(nombre)
    if (!datos) return 'invalida'

    // Camino normal: el servicio ya dialogó (producto, stock y confirmación) y
    // dejó la venta resuelta. Se importa tal cual, sin reinterpretar.
    const resuelta = pendienteResuelto(datos)
    if (resuelta) {
      if (!resuelta.origenId) resuelta.origenId = nombre
      const fila = await acciones.crear(resuelta)
      return fila ? 'creada' : 'duplicada'
    }

    const entrada = normalizarEntradaBuzon(datos)
    if (!entrada) return 'invalida'

    // El nombre del fichero es el id de origen cuando el servicio no lo mandó:
    // así reimportar el mismo archivo nunca duplica la acción.
    if (!entrada.origenId) entrada.origenId = nombre

    const voz = entrada.ubicacion === 'almacen' ? vozAlmacen : vozQuiosco
    // Sin pantalla no hay conflicto de ubicación ni ajuste de venta directa que
    // respetar: lo dictado se anota siempre para revisión.
    const accion = await voz.resolver(entrada.texto, {
      sttConfidence: entrada.sttConfidence,
      alternativas: entrada.alternativas,
      ventaDirecta: true,
      permitirConflicto: false
    })

    const documento = pendienteDesdeAccion(accion, entrada)
    if (!documento) return 'ignorada'

    const fila = await acciones.crear(documento)
    return fila ? 'creada' : 'duplicada'
  }

  /**
   * Vacía el buzón. Serializado: el layout y la vuelta del background pueden
   * dispararlo a la vez y no debe procesarse un fichero dos veces.
   */
  async function drenar() {
    const resultado = { leidos: 0, creados: 0, ignorados: 0, errores: 0 }
    if (!esNativo) return resultado
    if (!auth.usuarioActual.value?.puestoId) return resultado
    if (enCurso) return enCurso

    enCurso = (async () => {
      let nombres = []
      try {
        const listado = await Filesystem.readdir({ path: DIRECTORIO, directory: Directory.Data })
        nombres = (listado?.files ?? [])
          .map(f => (typeof f === 'string' ? f : f?.name))
          .filter(n => typeof n === 'string' && n.endsWith('.json'))
          .sort()
          .slice(0, MAX_POR_DRENAJE)
      } catch {
        // Sin carpeta todavía: no hay nada dictado con la app cerrada.
        return resultado
      }

      for (const nombre of nombres) {
        resultado.leidos++
        try {
          const estado = await procesarEntrada(nombre)
          if (estado === 'creada') resultado.creados++
          else if (estado === 'ignorada' || estado === 'invalida') resultado.ignorados++
          // Importada, duplicada o no aplicable: el fichero ya cumplió su
          // función. Un fallo real (catch) lo deja para el próximo intento.
          await borrarEntrada(nombre)
        } catch {
          resultado.errores++
        }
      }

      // Las reservas ya están en las acciones importadas (y el snapshot que
      // escribe el layout las descuenta como pendientes). Si algo falló, se
      // conservan para que el servicio siga sin prometer ese stock.
      if (!resultado.errores) {
        await Filesystem.deleteFile({ path: RUTA_RESERVAS, directory: Directory.Data })
          .catch(() => {})
      }
      return resultado
    })().finally(() => { enCurso = null })

    return enCurso
  }

  return { esNativo, drenar }
}
