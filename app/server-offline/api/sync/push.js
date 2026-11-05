/**
 * server-offline/sync/push.js
 *
 * Prepara el payload de push: reúne todos los registros con sincronizado = 0
 * de cada tabla sincronizable, listos para enviar al servidor.
 * Incluye deletes pendientes.
 *
 * Se lee con `queryAll` (filas crudas) y NO con `useLocalRepo().readAll()`:
 * `readAll` pasa por la lista de la UI, que aplica `serialize` y `listFilter`.
 * Eso dejaba filas pendientes para siempre — `serializarUsuario` descarta
 * `sincronizado`, así que todos los usuarios se reenviaban en cada sync, y los
 * clientes fusionados quedaban excluidos del push. Además evita leer y
 * convertir dos veces las mismas filas.
 *
 * REPARACIÓN DE FKs ANULABLES HUÉRFANAS
 * Un id colgante en una columna nullable (`movimientos_inventario.linea_cuadre_id`
 * hacia un `cuadre_items` que ya no existe, por ejemplo) hace que Postgres
 * devuelva 23503 y, antes, abortaba el push entero. La fila no se puede
 * inventar: el padre no está en el dispositivo ni viaja en el payload. Se pone
 * la referencia a NULL —la columna es nullable precisamente para esto— y se
 * envía la fila reparada. Las FK obligatorias (NOT NULL) no se tocan: si una de
 * esas apunta a un padre ausente, el servidor la reporta como rechazo y la
 * sync continúa.
 *
 * Tampoco se reenvían las filas que el servidor ya rechazó y que no han
 * cambiado desde entonces: quedarían bloqueando cada sincronización para
 * siempre. En cuanto el usuario las edita (`actualizadoEn` nuevo) vuelven a
 * entrar.
 */
import { SYNC_TABLES } from '../../../../shared/tables'
import {
  getPendingDeletes,
  getSyncRechazos,
  limpiarSyncRechazos
} from '../_factory'
import { useDb } from '../../db/client'

/**
 * Filtra las filas que el servidor rechazaría por pertenecer a otro puesto.
 * Con `repo.readAll()` esto lo hacía `queryFromDb`; al leer crudo hay que
 * hacerlo aquí, porque un solo id ajeno aborta el lote entero con 403.
 */
function filtrarPorPuesto(rows, cfg, puestoId) {
  if (!cfg.puestoScoped || !puestoId) return rows
  return rows.filter(r => !r.puestoId || r.puestoId === puestoId)
}

/**
 * FKs ANULABLES -> tabla padre. Solo aparecen aquí columnas que en el esquema
 * de Postgres admiten NULL; las obligatorias se quedan fuera a propósito (no
 * se puede "reparar" una referencia que el negocio exige).
 *
 * El orden de SYNC_TABLES es topológico, así que cuando se procesa una tabla
 * todas sus posibles padres ya se leyeron y sus ids están en `idsPorTabla`.
 */
const FK_ANULABLES = {
  cuadres: { trabajadorTurnoId: 'usuarios' },
  clientes: { fusionadoEn: 'clientes' },
  cuentas_fiado: { cuadreOrigenId: 'cuadres' },
  pagos_fiado: { cuadreId: 'cuadres' },
  historial_precios: { cambiadoPor: 'usuarios' },
  lotes: { proveedorId: 'proveedores', creadoPor: 'usuarios' },
  traspasos: { usuarioId: 'usuarios' },
  ajustes: { clienteId: 'clientes' },
  recargas: { clienteId: 'clientes' },
  movimientos_inventario: {
    loteId: 'lotes',
    cuadreId: 'cuadres',
    lineaCuadreId: 'cuadre_items',
    traspasoId: 'traspasos',
    ventaDirectaId: 'ventas_directas',
    usuarioId: 'usuarios',
    anuladoPor: 'usuarios'
  }
}

/**
 * Pone a NULL las FKs anulables que apuntan a un padre inexistente en la copia
 * local. Devuelve las filas reparadas (para enviarlas) y los ids que se
 * repararon (para olvidar un rechazo viejo por esa misma referencia).
 */
async function repararFkAnulables(db, tabla, filas, idsPorTabla) {
  const mapa = FK_ANULABLES[tabla]
  if (!mapa || !filas.length) return { filas, reparadas: new Set() }

  const reparadas = new Set()
  const salida = []

  for (const fila of filas) {
    let cambios = null

    for (const [campo, padre] of Object.entries(mapa)) {
      const valor = fila[campo]
      if (!valor) continue
      const idsPadre = idsPorTabla[padre]
      // Padre aún no leído (no debería pasar con el orden topológico): no se
      // puede afirmar que sea huérfano, así que se deja como está.
      if (!idsPadre) continue
      if (idsPadre.has(valor)) continue
      if (!cambios) cambios = {}
      cambios[campo] = null
    }

    if (!cambios) {
      salida.push(fila)
      continue
    }

    salida.push({ ...fila, ...cambios })
    reparadas.add(fila.id)
    // Persistir la reparación en sqlite: si el push falla a medias, la próxima
    // sincronización no vuelve a tropezar con la misma referencia. No se toca
    // `actualizadoEn` (la fila sigue pendiente y con su marca original).
    try {
      await db.update(tabla, fila.id, cambios)
    } catch {
      // best-effort: el payload ya va reparado
    }
  }

  return { filas: salida, reparadas }
}

export async function push(opts, auth) {
  void opts
  const db = useDb()
  const authActual = auth?.usuarioActual ? auth : (typeof useAuth === 'function' ? useAuth() : null)
  const puestoId = authActual?.usuarioActual?.value?.puestoId ?? null
  const rechazos = await getSyncRechazos()
  const idsPorTabla = {}
  const result = {}

  for (const cfg of SYNC_TABLES) {
    const todas = await db.queryAll(cfg.tabla)
    idsPorTabla[cfg.tabla] = new Set(todas.map(r => r.id))

    const pendientes = filtrarPorPuesto(todas, cfg, puestoId)
      .filter(r => !r.sincronizado)
      .map((row) => {
        const { sincronizado, ...rest } = row
        void sincronizado
        return rest
      })

    const { filas, reparadas } = await repararFkAnulables(db, cfg.tabla, pendientes, idsPorTabla)

    if (reparadas.size) {
      // El rechazo anterior pudo ser justo por esa FK; la fila ya cambió de
      // forma aunque su `actualizadoEn` no, así que se reintenta.
      await limpiarSyncRechazos(cfg.tabla, [...reparadas])
    }

    let listas = filas.filter((fila) => {
      const rec = rechazos[`${cfg.tabla}:${fila.id}`]
      if (!rec) return true
      return String(rec.actualizadoEn ?? '') !== String(fila.actualizadoEn ?? '')
    })

    if (cfg.tabla === 'recargas' && listas.length) {
      // smsId es local (sms_etecsa no se sincroniza): mandarlo romperia la FK
      // en el servidor. Se quita en ambas cajas por si acaso.
      listas = listas.map((r) => {
        const copia = { ...r }
        delete copia.smsId
        delete copia.sms_id
        return copia
      })
    }
    // `usuarios` ya viaja con pinHash (columna real de sqlite): el servidor lo
    // exige (NOT NULL) para crear usuarios desde el dispositivo.
    result[cfg.tabla] = listas
  }
  result.deletes = await getPendingDeletes()
  return result
}
