import { TABLES } from '../../shared/tables'
import { parseEtecsaSms } from '../utils/parseEtecsaSms'
import { smsNotificar } from '../utils/sms'

const recargaConfig = TABLES.recargas
const cobroConfig = TABLES.cobros_recarga
/** sms_etecsa es la bandeja: local al teléfono, sin endpoints ni sync. */
const smsConfig = { tabla: 'sms_etecsa' }

/**
 * useRecargas - Dominio del módulo de recargas Etecsa.
 *
 * El flujo NO es automático a propósito: el SMS que confirma una recarga entra
 * en una bandeja (`sms_etecsa` con estado 'pendiente') y el jefe decide cuándo
 * pasa al historial, además de si se pagó o queda como deuda. Meterla
 * sola al historial obligaría a corregir a posteriori una recarga que en
 * mostrador se cobró en efectivo.
 */
export function useRecargas() {
  const conexion = useModoConexion()
  const esOnline = computed(() => conexion.modo.value === 'online')
  const auth = useAuth()
  const cli = useClientes()

  const recargasRepo = computed(() => (esOnline.value ? useRemoteRepo(recargaConfig) : useLocalRepo(recargaConfig)))
  const cobrosRepo = computed(() => (esOnline.value ? useRemoteRepo(cobroConfig) : useLocalRepo(cobroConfig)))
  const smsRepo = useLocalRepo(smsConfig)

  const puestoId = () => auth.usuarioActual.value?.puestoId ?? null

  /** Bandeja: recargas confirmadas por SMS que aún no están en el historial. */
  const pendientes = ref([])
  /** Historial de recargas. */
  const lista = ref([])
  const cargando = ref(false)

  // ---------------------------------------------------------------- captura

  /**
   * Un SMS drenado de la cola nativa entra en la bandeja. NO crea recarga.
   * @returns {Promise<{estado: 'pendiente'|'descartada'|'duplicada'|'omitida', fila?: object}>}
   */
  async function procesarSms(mensaje) {
    const cuerpo = mensaje?.cuerpo ?? ''
    if (!cuerpo) return { estado: 'omitida' }

    const datos = parseEtecsaSms({ remitente: mensaje.remitente, cuerpo })
    const recibidoEn = Number(new Date(mensaje.recibidoEn || Date.now()))

    // Lo que no es recarga (autenticaciones, saldos, transferencias, errores)
    // no entra en la bandeja: no hay nada que confirmar.
    if (!datos) return { estado: 'descartada' }

    // Si el ID de transacción ya está en el historial, esta recarga ya se
    // registró por otra vía: el barrido no debe volver a proponerla.
    const [yaHistorizada] = await recargasRepo.value.readAll({ query: { idTransaccion: datos.idTransaccion } })
    if (yaHistorizada) return { estado: 'duplicada' }

    const cliente = cli.buscarPorTelefono(datos.telefono)

    try {
      const fila = await smsRepo.create({
        remitente: mensaje.remitente ?? '',
        cuerpo,
        recibidoEn,
        hash: mensaje.hash ?? `${recibidoEn}-${datos.idTransaccion}`,
        telefonoDestino: datos.telefono,
        telefonoRaw: datos.telefonoRaw,
        plataforma: datos.plataforma,
        tipo: datos.tipo,
        descripcion: datos.descripcion,
        unidades: datos.unidades,
        montoNominal: datos.montoNominal,
        costo: datos.costo,
        ganancia: datos.ganancia,
        idTransaccion: datos.idTransaccion,
        saldoCarteraCup: datos.saldoCarteraCup,
        saldoCarteraUsd: datos.saldoCarteraUsd,
        estado: 'pendiente',
        clienteId: cliente?.clienteId ?? null
      })
      return { estado: 'pendiente', fila }
    } catch {
      // El hash es único: si falla el insert es que este SMS ya estaba.
      return { estado: 'duplicada' }
    }
  }

  async function procesarLote(mensajes) {
    const stats = { pendientes: 0, descartadas: 0, duplicadas: 0, omitidas: 0 }
    if (!mensajes?.length) return stats

    // El emparejamiento por número necesita el catálogo de teléfonos de los
    // clientes: sin esto cada recarga entraría como "sin cliente".
    await cli.cargarTelefonos()

    for (const m of mensajes) {
      try {
        const r = await procesarSms(m)
        if (r.estado in stats) stats[r.estado]++
      } catch {
        stats.omitidas++
      }
    }
    if (stats.pendientes > 0) {
      await cargarPendientes()
      await smsNotificar({
        titulo: 'Recarga recibida',
        cuerpo: `${stats.pendientes} recarga(s) esperando en la bandeja`
      })
    }
    return stats
  }

  // ---------------------------------------------------------------- bandeja

  async function cargarPendientes() {
    const filas = await smsRepo.readAll({ query: { estado: 'pendiente' } })
    pendientes.value = (filas || [])
      .slice()
      .sort((a, b) => (b.recibidoEn ?? 0) - (a.recibidoEn ?? 0))
    return pendientes.value
  }

  /**
   * Pasa una pendiente al historial. Exige cliente (sin dueño no hay a quién
   * imputarla) y deja el estado de pago ya decidido.
   * @param {string} smsId
   * @param {{ clienteId: string, estadoPago: 'pagada'|'pendiente' }} opciones
   */
  async function confirmar(smsId, { clienteId, estadoPago }) {
    const p = pendientes.value.find(x => x.id === smsId)
    if (!p) throw new Error('Esta recarga ya no está en la bandeja.')
    if (!clienteId) throw new Error('La recarga necesita un cliente.')

    const pid = puestoId()
    if (!pid) throw new Error('No hay puesto identificado.')

    const pagada = estadoPago === 'pagada'
    const recarga = await recargasRepo.value.create({
      puestoId: pid,
      clienteId,
      telefonoDestino: p.telefonoDestino,
      telefonoRaw: p.telefonoRaw,
      plataforma: p.plataforma,
      tipo: p.tipo,
      descripcion: p.descripcion,
      unidades: p.unidades,
      montoNominal: p.montoNominal,
      costo: p.costo,
      ganancia: p.ganancia,
      idTransaccion: p.idTransaccion,
      saldoCarteraCup: p.saldoCarteraCup,
      saldoCarteraUsd: p.saldoCarteraUsd,
      estadoPago: pagada ? 'pagada' : 'pendiente',
      montoCobrado: pagada ? p.montoNominal : 0,
      smsId: p.id
    })

    await smsRepo.update(p.id, { estado: 'guardada', recargaId: recarga.id, clienteId })
    await cargarPendientes()
    return recarga
  }

  // --------------------------------------------------------------- historial

  async function cargarRecargas(filtro = {}) {
    cargando.value = true
    try {
      const filas = await recargasRepo.value.readAll({ query: filtro })
      lista.value = (filas || []).slice().sort((a, b) => (b.creadoEn ?? 0) - (a.creadoEn ?? 0))
      return lista.value
    } finally {
      cargando.value = false
    }
  }

  async function asignarCliente(recargaId, clienteId) {
    const act = await recargasRepo.value.patch(recargaId, { clienteId })
    const i = lista.value.findIndex(r => r.id === recargaId)
    if (i >= 0) lista.value[i] = { ...lista.value[i], ...act }
    return act
  }

  /**
   * Cobro (total o parcial) contra una recarga fiada. Al cubrir el nominal la
   * marca pagada sola, igual que en Deudas.
   */
  async function cobrar(recargaId, monto, formaPago = 'efectivo') {
    const r = lista.value.find(x => x.id === recargaId)
    const saldo = Number(r?.saldoPendiente ?? 0) || (Number(r?.montoNominal ?? 0) - Number(r?.montoCobrado ?? 0))
    const valor = Number(monto)
    if (!(valor > 0)) throw new Error('El monto debe ser mayor a cero.')
    if (valor > saldo) throw new Error('El cobro supera el saldo pendiente.')

    const cobrado = Number(r?.montoCobrado ?? 0) + valor
    await cobrosRepo.value.create({ recargaId, monto: valor, formaPago })
    const act = await recargasRepo.value.patch(recargaId, {
      montoCobrado: cobrado,
      estadoPago: cobrado >= Number(r?.montoNominal ?? 0) ? 'pagada' : 'pendiente'
    })
    const i = lista.value.findIndex(x => x.id === recargaId)
    if (i >= 0) lista.value[i] = { ...lista.value[i], ...act }
    return act
  }

  /**
   * Historial de cobros de una recarga, para ver qué se cobró y por dónde.
   * Espejo de pagosDeCuenta en Deudas.
   */
  async function cobrosDeRecarga(recargaId) {
    const todos = await cobrosRepo.value.readAll()
    return (todos || [])
      .filter(p => p.recargaId === recargaId)
      .sort((a, b) => new Date(a.creadoEn ?? 0) - new Date(b.creadoEn ?? 0))
  }

  return {
    cli,
    recargasRepo,
    cobrosRepo,
    pendientes,
    lista,
    cargando,
    procesarSms,
    procesarLote,
    cargarPendientes,
    confirmar,
    cargarRecargas,
    asignarCliente,
    cobrar,
    cobrosDeRecarga
  }
}
