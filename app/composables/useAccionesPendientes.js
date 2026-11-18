import { computed, ref } from 'vue'
import { TABLES } from '../../shared/tables'
import { generarId } from '../../shared/inventario/operaciones'
import { useAuth } from './useAuth'
import { useCuentasFiado } from './useCuentasFiado'
import { useInventario } from './useInventario'
import { useLocalRepo } from './useLocalRepo'
import { useModoConexion } from './useModoConexion'
import { useRemoteRepo } from './useRemoteRepo'
import { estaCaducada, puedeAplicar, resumenPendientes } from '../utils/voice/pendientes'

/**
 * useAccionesPendientes — cola de lo dictado por voz que espera revisión.
 *
 * La voz no registra sola: cada comando que mueve datos queda aquí (aunque la
 * app estuviera cerrada, el servicio en primer plano deja el texto en un fichero
 * del buzón) y se aplica cuando el jefe confirma en pantalla. Las consultas no
 * pasan por aquí: se responden al momento.
 *
 * La tabla es local al teléfono; lo que se sincroniza es la venta directa que
 * nace al aplicar la acción.
 */

const CONFIG = { tabla: 'acciones_pendientes_voz' }

/** Cuántos días se guarda una acción ya cerrada antes de borrarla. */
const DIAS_HISTORIAL = 30

// Estado compartido: la pantalla /pendientes y el badge del menú miran la misma
// lista. Una sola carga en vuelo a la vez.
const lista = ref([])
const cargando = ref(false)
let cargaEnCurso = null
let cargadoPara = null

function reemplazar(fila) {
  if (!fila?.id) return
  const idx = lista.value.findIndex(a => a.id === fila.id)
  if (idx === -1) lista.value = [...lista.value, fila]
  else lista.value = lista.value.map(a => (a.id === fila.id ? fila : a))
}

export function useAccionesPendientes() {
  const auth = useAuth()
  const inv = useInventario()
  const conexion = useModoConexion()
  const repo = useLocalRepo(CONFIG)
  const fiado = useCuentasFiado()
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
  const pagosRepo = computed(() => (
    conexion.modo.value === 'online'
      ? useRemoteRepo(TABLES.pagos_fiado)
      : useLocalRepo(TABLES.pagos_fiado)
  ))

  const puestoId = computed(() => auth.usuarioActual.value?.puestoId ?? null)

  const pendientes = computed(() => lista.value.filter(a => a.estado === 'pendiente'))
  const revisadas = computed(() => lista.value.filter(a => a.estado !== 'pendiente'))
  const totales = computed(() => resumenPendientes(lista.value))
  const hayPendientes = computed(() => pendientes.value.length > 0)

  /**
   * Carga la cola del puesto. Las acciones pasadas del tope de seguridad se
   * archivan solas (no se borran: quedan en el historial para auditar).
   */
  async function cargar({ forzar = false } = {}) {
    const pid = puestoId.value
    if (!pid) return []
    if (!forzar && cargadoPara === pid) return lista.value
    if (cargaEnCurso) return cargaEnCurso

    cargando.value = true
    cargaEnCurso = (async () => {
      const filas = await repo.readAll({ query: { orderBy: 'dictadoEn', orderDir: 'asc' } })
      lista.value = filas ?? []
      cargadoPara = pid

      const viejas = lista.value.filter(a => a.estado === 'pendiente' && estaCaducada(a.dictadoEn))
      for (const accion of viejas) {
        try {
          const fila = await repo.update(accion.id, {
            estado: 'archivada',
            motivo: 'caducada'
          })
          reemplazar(fila ?? { ...accion, estado: 'archivada', motivo: 'caducada' })
        } catch {
          // Si falla el archivado, la acción sigue visible: no se pierde nada.
        }
      }
      await purgarArchivadas()
      return lista.value
    })().finally(() => {
      cargando.value = false
      cargaEnCurso = null
    })

    return cargaEnCurso
  }

  /**
   * Borra las acciones ya cerradas y muy antiguas. El historial sirve para
   * auditar unos días; guardarlo para siempre solo engorda la tabla local.
   */
  async function purgarArchivadas({ dias = DIAS_HISTORIAL, ahora = Date.now() } = {}) {
    const limite = ahora - dias * 24 * 60 * 60 * 1000
    const viejas = lista.value.filter((a) => {
      if (a.estado === 'pendiente') return false
      const referencia = Number(a.aplicadaEn ?? a.dictadoEn) || 0
      return referencia > 0 && referencia < limite
    })
    if (!viejas.length) return 0
    for (const accion of viejas) {
      try {
        await repo.remove(accion.id)
        lista.value = lista.value.filter(a => a.id !== accion.id)
      } catch {
        // Si no se puede borrar, se queda: no es un dato en uso.
      }
    }
    return viejas.length
  }

  /**
   * Guarda una acción dictada. `accion` trae los datos ya interpretados; puede
   * venir sin producto (no se entendió el nombre) para que quede el dictado en
   * la revisión en vez de perderse. Devuelve `null` si esa acción ya estaba
   * importada (`origenId` repetido).
   */
  async function crear(accion) {
    const pid = puestoId.value
    if (!pid) throw new Error('Sin puesto identificado.')
    if (!accion?.texto) throw new Error('La acción no trae el texto dictado.')

    const usuario = auth.usuarioActual.value
    const cantidad = Math.max(1, Math.trunc(Number(accion.cantidad) || 1))
    const precioUnitario = Number(accion.precioUnitario) || 0
    const importe = accion.importe == null
      ? Math.round(precioUnitario * cantidad * 100) / 100
      : Math.round((Number(accion.importe) || 0) * 100) / 100
    const documento = {
      id: accion.id || generarId(),
      puestoId: pid,
      usuarioId: accion.usuarioId ?? usuario?.id ?? '',
      usuarioNombre: accion.usuarioNombre ?? usuario?.nombre ?? null,
      ubicacion: accion.ubicacion === 'almacen' ? 'almacen' : 'quiosco',
      tipo: accion.tipo ?? 'venta',
      tipoVenta: ['directa', 'casa', 'familiar', 'regalo'].includes(accion.tipoVenta)
        ? accion.tipoVenta
        : 'directa',
      texto: String(accion.texto ?? ''),
      sttConfidence: accion.sttConfidence == null ? null : Number(accion.sttConfidence),
      origen: accion.origen === 'servicio' ? 'servicio' : 'app',
      origenId: accion.origenId ?? null,
      productoId: accion.productoId ?? null,
      productoNombre: accion.productoNombre ?? null,
      cantidad,
      precioUnitario,
      importe,
      clienteId: accion.clienteId ?? null,
      cuentaFiadoId: accion.cuentaFiadoId ?? null,
      formaPago: accion.formaPago === 'transferencia' ? 'transferencia' : 'efectivo',
      estado: 'pendiente',
      motivo: accion.motivo ?? null,
      // El id de la venta se decide ahora: reintentar la aplicación no duplica.
      ventaDirectaId: accion.ventaDirectaId || generarId(),
      dictadoEn: Number(accion.dictadoEn) || Date.now(),
      aplicadaEn: null
    }

    try {
      const fila = await repo.create(documento)
      reemplazar(fila ?? documento)
      return fila ?? documento
    } catch (e) {
      // `origenId` es único: reimportar el buzón no debe duplicar la acción.
      if (/unique|constraint/i.test(e?.message ?? '')) return null
      throw e
    }
  }

  /**
   * Busca la venta que pudo dejar un intento anterior.
   *
   * En local `read(id)` alcanza. El endpoint remoto no tiene GET por id, así que
   * en online se cae al listado del día del dictado: es la misma consulta que
   * usa la pantalla de salidas y evita duplicar stock al reintentar.
   */
  async function ventaPrevia(ventaDirectaId, dictadoEn) {
    // El endpoint remoto no tiene GET por id: en online se va directo al listado.
    if (conexion.modo.value !== 'online') {
      const directa = await ventasRepo.value.read(ventaDirectaId).catch(() => null)
      return directa?.id ? directa : null
    }
    const base = Number(dictadoEn) || Date.now()
    const desde = new Date(base)
    desde.setHours(0, 0, 0, 0)
    const hasta = new Date(base)
    hasta.setHours(23, 59, 59, 999)
    const filas = await ventasRepo.value
      .readAll({ query: { desde: desde.toISOString(), hasta: hasta.toISOString() } })
      .catch(() => [])
    return (filas ?? []).find(v => v?.id === ventaDirectaId) ?? null
  }

  /**
   * Deuda que pudo dejar un intento anterior de aplicar el fiado. Misma regla
   * que `ventaPrevia`: el id se asigna al dictar, así reintentar no duplica.
   */
  async function deudaPrevia(cuentaId, dictadoEn) {
    if (conexion.modo.value !== 'online') {
      const cuenta = await cuentasRepo.value.read(cuentaId).catch(() => null)
      return cuenta?.id ? cuenta : null
    }
    const base = Number(dictadoEn) || Date.now()
    const desde = new Date(base)
    desde.setHours(0, 0, 0, 0)
    const hasta = new Date(base)
    hasta.setHours(23, 59, 59, 999)
    const filas = await cuentasRepo.value
      .readAll({ query: { desde: desde.toISOString(), hasta: hasta.toISOString() } })
      .catch(() => [])
    return (filas ?? []).find(c => c?.id === cuentaId) ?? null
  }

  /**
   * Registra la venta directa de una acción pendiente y la marca aplicada.
   *
   * `dictadoEn` es la fecha de la venta, no la de confirmación. Antes de
   * escribir se comprueba si esa venta ya existe (intento anterior que escribió
   * y falló al cerrar la fila): así aplicar dos veces no duplica el stock.
   */
  async function aplicar(accion) {
    if (!puedeAplicar(accion)) throw new Error('Esta acción ya no se puede aplicar.')

    if (accion.tipo === 'deuda') return aplicarDeuda(accion)
    if (accion.tipo === 'cobro') return aplicarCobro(accion)

    const ventaDirectaId = accion.ventaDirectaId || generarId()
    const previa = await ventaPrevia(ventaDirectaId, accion.dictadoEn)

    let idFinal = ventaDirectaId
    if (!previa) {
      const creada = await inv.registrarVentaDirecta({
        id: ventaDirectaId,
        creadoEn: Number(accion.dictadoEn) || Date.now(),
        ubicacion: accion.ubicacion === 'almacen' ? 'almacen' : 'quiosco',
        tipoVenta: accion.tipoVenta || 'directa',
        clienteId: accion.clienteId || null,
        notas: `Dictada por voz: "${String(accion.texto || '').slice(0, 200)}"`,
        lineas: [{
          productoId: accion.productoId,
          cantidad: Math.max(1, Math.trunc(Number(accion.cantidad) || 1)),
          precioVentaUsado: Number(accion.precioUnitario) || 0,
          secuencia: 0
        }]
      })
      // Online el servidor decide el id: se guarda el real para poder auditarlo.
      if (creada?.id) idFinal = creada.id
    }

    const fila = await repo.update(accion.id, {
      estado: 'aplicada',
      aplicadaEn: Date.now(),
      ventaDirectaId: idFinal,
      motivo: null
    })
    const final = fila ?? { ...accion, estado: 'aplicada', aplicadaEn: Date.now(), ventaDirectaId: idFinal }
    reemplazar(final)
    return final
  }

  /**
   * Aplica un fiado dictado: crea la deuda directa (descuenta stock y congela
   * costo, igual que desde `/deudas`) y enlaza la fila con la cuenta creada.
   */
  async function aplicarDeuda(accion) {
    if (!accion?.clienteId) throw new Error('El fiado no tiene cliente.')
    if (!accion?.productoId) throw new Error('El fiado no tiene producto.')

    const cuentaId = accion.ventaDirectaId || generarId()
    const previa = await deudaPrevia(cuentaId, accion.dictadoEn)

    let idFinal = cuentaId
    if (!previa) {
      const creada = await fiado.registrarDeudaDirecta({
        // En local el id se asigna al dictar: reintentar no duplica la deuda.
        id: cuentaId,
        clienteId: accion.clienteId,
        ubicacion: accion.ubicacion === 'almacen' ? 'almacen' : 'quiosco',
        lineas: [{
          productoId: accion.productoId,
          cantidad: Math.max(1, Math.trunc(Number(accion.cantidad) || 1)),
          precioVentaUsado: Number(accion.precioUnitario) || 0
        }]
      })
      if (!creada?.ok) throw creada?.error ?? new Error('No se pudo registrar la deuda.')
      // Online el servidor decide el id.
      if (creada?.id) idFinal = creada.id
    }

    const fila = await repo.update(accion.id, {
      estado: 'aplicada',
      aplicadaEn: Date.now(),
      ventaDirectaId: idFinal,
      motivo: null
    })
    const final = fila ?? { ...accion, estado: 'aplicada', aplicadaEn: Date.now(), ventaDirectaId: idFinal }
    reemplazar(final)
    return final
  }

  /**
   * Pago que pudo dejar un intento anterior de cobrar. El id se asigna al
   * dictar, así reintentar no cobra dos veces.
   */
  async function pagoPrevio(pagoId) {
    if (conexion.modo.value !== 'online') {
      const pago = await pagosRepo.value.read(pagoId).catch(() => null)
      return pago?.id ? pago : null
    }
    const filas = await pagosRepo.value.readAll().catch(() => [])
    return (filas ?? []).find(p => p?.id === pagoId) ?? null
  }

  /**
   * Aplica un cobro dictado: registra el pago (baja el saldo de la deuda) y
   * cierra la fila. Un pago por deuda, repartidos FIFO por el servicio.
   */
  async function aplicarCobro(accion) {
    if (!accion?.cuentaFiadoId) throw new Error('El cobro no indica la deuda.')
    const monto = Math.round((Number(accion.importe) || 0) * 100) / 100
    if (!(monto > 0)) throw new Error('El cobro no tiene importe.')

    const pagoId = accion.ventaDirectaId || generarId()
    const previo = await pagoPrevio(pagoId)
    if (!previo) {
      const r = await fiado.cobrarDeuda({
        id: pagoId,
        cuentaFiadoId: accion.cuentaFiadoId,
        monto,
        formaPago: accion.formaPago === 'transferencia' ? 'transferencia' : 'efectivo'
      })
      if (!r?.ok) throw r?.error ?? new Error('No se pudo registrar el cobro.')
    }

    const fila = await repo.update(accion.id, {
      estado: 'aplicada',
      aplicadaEn: Date.now(),
      ventaDirectaId: pagoId,
      motivo: null
    })
    const final = fila ?? { ...accion, estado: 'aplicada', aplicadaEn: Date.now(), ventaDirectaId: pagoId }
    reemplazar(final)
    return final
  }

  /**
   * Corrige una acción antes de confirmarla (producto, cantidad o precio).
   * El importe se recalcula: lo que la pantalla muestra es lo que se cobrará.
   */
  async function actualizar(accion, campos = {}) {
    if (!accion?.id) throw new Error('Acción sin id.')
    const parche = { ...campos }
    const cantidad = parche.cantidad != null
      ? Math.max(1, Math.trunc(Number(parche.cantidad) || 1))
      : Math.max(1, Math.trunc(Number(accion.cantidad) || 1))
    const precioUnitario = parche.precioUnitario != null
      ? Math.round((Number(parche.precioUnitario) || 0) * 100) / 100
      : Number(accion.precioUnitario) || 0
    if (parche.cantidad != null) parche.cantidad = cantidad
    if (parche.precioUnitario != null) parche.precioUnitario = precioUnitario
    parche.importe = Math.round(precioUnitario * cantidad * 100) / 100
    if (parche.productoId) parche.motivo = null

    const fila = await repo.update(accion.id, parche)
    const final = fila ?? { ...accion, ...parche }
    reemplazar(final)
    return final
  }

  /** Archiva (o descarta) sin registrar nada. El texto queda para auditar. */
  async function archivar(accion, motivo = 'descartada') {
    if (!accion?.id) return null
    const fila = await repo.update(accion.id, {
      estado: 'archivada',
      motivo,
      aplicadaEn: null
    })
    const final = fila ?? { ...accion, estado: 'archivada', motivo }
    reemplazar(final)
    return final
  }

  /**
   * Cierra una acción cuando la venta la registró otra vía (el diálogo de
   * edición). No vuelve a escribir la venta: solo enlaza la fila con la que
   * nació para que el historial diga de dónde salió.
   */
  async function marcarAplicada(accion, ventaDirectaId = null) {
    if (!accion?.id) return null
    const idVenta = ventaDirectaId || accion.ventaDirectaId || null
    const fila = await repo.update(accion.id, {
      estado: 'aplicada',
      aplicadaEn: Date.now(),
      ventaDirectaId: idVenta,
      motivo: null
    })
    const final = fila ?? {
      ...accion,
      estado: 'aplicada',
      aplicadaEn: Date.now(),
      ventaDirectaId: idVenta,
      motivo: null
    }
    reemplazar(final)
    return final
  }

  /** Olvida la caché: el próximo `cargar()` vuelve a leer la tabla. */
  function invalidar() {
    cargadoPara = null
    lista.value = []
  }

  return {
    pendientes,
    revisadas,
    totales,
    hayPendientes,
    cargando,
    cargar,
    crear,
    actualizar,
    aplicar,
    marcarAplicada,
    archivar,
    purgarArchivadas,
    invalidar
  }
}
