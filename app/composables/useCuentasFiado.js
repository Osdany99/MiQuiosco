import { TABLES } from '../../shared/tables'
import { $api } from '../utils/api'
import { calcularExcesoTope, sumarPorProducto } from '../../shared/fiadoTope'
import { consumoPorProductoEnCuadreLocal } from '../utils/topeGeneral'
import { construirVentaDirecta, lotesConSaldo } from '../../shared/inventario/operaciones'
import { useDb } from '../server-offline/db/client'

const cuentaFiadoConfig = TABLES.cuentas_fiado
const cuentaFiadoItemConfig = TABLES.cuentas_fiado_items
const pagoFiadoConfig = TABLES.pagos_fiado
const cuadreConfig = TABLES.cuadres
const cuadreItemConfig = TABLES.cuadre_items
const transferenciaConfig = TABLES.transferencias
const transferenciaItemConfig = TABLES.transferencia_items
const ajusteConfig = TABLES.ajustes
const lotesConfig = TABLES.lotes
const movimientosConfig = TABLES.movimientos_inventario
const productosConfig = TABLES.productos

export function useCuentasFiado() {
  const toast = useToast()
  const conexion = useModoConexion()
  const esOnline = computed(() => conexion.modo.value === 'online')
  const auth = useAuth()

  function apiHeaders() {
    const token = auth.jwtSync.value
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  // Repos mode-aware (online → API remota, local → SQLite)
  const cuentasRepo = computed(() => esOnline.value ? useRemoteRepo(cuentaFiadoConfig) : useLocalRepo(cuentaFiadoConfig))
  const itemsRepo = computed(() => esOnline.value ? useRemoteRepo(cuentaFiadoItemConfig) : useLocalRepo(cuentaFiadoItemConfig))
  const pagosRepo = computed(() => esOnline.value ? useRemoteRepo(pagoFiadoConfig) : useLocalRepo(pagoFiadoConfig))
  const cuadresRepo = computed(() => esOnline.value ? useRemoteRepo(cuadreConfig) : useLocalRepo(cuadreConfig))
  const cuadreItemsRepo = computed(() => esOnline.value ? useRemoteRepo(cuadreItemConfig) : useLocalRepo(cuadreItemConfig))
  const transferenciasRepo = computed(() => esOnline.value ? useRemoteRepo(transferenciaConfig) : useLocalRepo(transferenciaConfig))
  const transferenciaItemsRepo = computed(() => esOnline.value ? useRemoteRepo(transferenciaItemConfig) : useLocalRepo(transferenciaItemConfig))
  const ajustesRepo = computed(() => esOnline.value ? useRemoteRepo(ajusteConfig) : useLocalRepo(ajusteConfig))
  const lotesRepo = computed(() => esOnline.value ? useRemoteRepo(lotesConfig) : useLocalRepo(lotesConfig))
  const movimientosRepo = computed(() => esOnline.value ? useRemoteRepo(movimientosConfig) : useLocalRepo(movimientosConfig))
  const productosRepo = computed(() => esOnline.value ? useRemoteRepo(productosConfig) : useLocalRepo(productosConfig))
  const db = useDb()

  function r(repo) {
    return repo.value
  }

  const { clientes, cargarClientes, crearCliente } = useClientes()
  const cuentasDelCuadre = ref([])
  const pagosDelCuadre = ref([])
  const cargando = ref(false)

  const montoFiadoCalculado = computed(() =>
    cuentasDelCuadre.value.reduce((sum, c) => sum + (Number(c.montoTotal) - Number(c.montoPagado)), 0)
  )

  const montoCobradoFiadoCalculado = computed(() =>
    pagosDelCuadre.value
      .filter(p => !cuentasDelCuadre.value.some(c => c.id === p.cuentaFiadoId))
      .reduce((sum, p) => sum + Number(p.monto), 0)
  )

  async function cargarActividadDelCuadre(cuadreId) {
    const todasCuentas = await r(cuentasRepo).readAll()
    cuentasDelCuadre.value = todasCuentas.filter(c => c.cuadreOrigenId === cuadreId)
    const todosPagos = await r(pagosRepo).readAll()
    pagosDelCuadre.value = todosPagos.filter(p => p.cuadreId === cuadreId)
  }

  /**
   * Cantidades vendidas por producto en el cuadre (líneas del cuadre).
   */
  async function vendidosPorProducto(cuadreId) {
    const items = await r(cuadreItemsRepo).readAll({ query: { cuadreId } })
    return sumarPorProducto(items)
  }

  /**
   * Cantidades ya consumidas por producto en el cuadre (fiado + transferencias
   * + ajustes), salvo las cuentas excluidas.
   */
  async function fiadosPorProducto(cuadreId, excluirCuentaIds = []) {
    return consumoPorProductoEnCuadreLocal({
      cuadreId,
      repos: {
        cuentasRepo: r(cuentasRepo),
        cuentasItemsRepo: r(itemsRepo),
        transferenciasRepo: r(transferenciasRepo),
        transferenciaItemsRepo: r(transferenciaItemsRepo),
        ajustesRepo: r(ajustesRepo)
      },
      excluir: { cuentaIds: excluirCuentaIds }
    })
  }

  /**
   * Valida el tope (solo modo local; en online lo hace el servidor):
   * vendido del cuadre vs consumido (fiado + transferencia + ajustes).
   * Devuelve mensaje de error o null si cabe.
   */
  async function validarTopeLocal(cuadreId, items, excluirCuentaIds = []) {
    if (esOnline.value) return null
    const [vendidos, consumidos] = await Promise.all([
      vendidosPorProducto(cuadreId),
      fiadosPorProducto(cuadreId, excluirCuentaIds)
    ])
    const exceso = calcularExcesoTope(vendidos, consumidos, items)
    if (!exceso) return null
    const yaFiado = Number(consumidos.get(exceso.productoId) ?? 0)
    return `Tope excedido: quedan ${exceso.disponible} unidades disponibles de este producto (vendido ${exceso.disponible + yaFiado}, incluye fiado).`
  }

  async function registrarNuevaDeuda({ clienteId, cuadreId, items, montoPagadoInicial, formaPagoInicial, puestoId }) {
    cargando.value = true
    try {
      const topeMsg = await validarTopeLocal(cuadreId, items)
      if (topeMsg) {
        toast.add({ title: 'Error', description: topeMsg, color: 'error' })
        return { ok: false, error: new Error(topeMsg) }
      }
      if (esOnline.value) {
        // Endpoint transaccional del servidor (cuenta + items + pago inicial + cuadre)
        await $api('/api/cuentas-fiado', {
          method: 'POST',
          body: { clienteId, cuadreOrigenId: cuadreId, items, montoPagadoInicial: montoPagadoInicial || 0, formaPagoInicial: formaPagoInicial || 'efectivo' },
          headers: apiHeaders()
        })
      } else {
        const montoTotal = items.reduce((s, it) => s + it.cantidad * it.precioVentaUsado, 0)
        // El servidor rechaza esto con 400; en local se guardaba una deuda
        // 'pagada' con un abono mayor que la deuda. Con el formulario de fiado
        // por fila (cantidad + pago inicial juntos) el despiste es de un clic.
        if ((montoPagadoInicial || 0) > montoTotal) {
          const msg = 'El pago inicial no puede superar el monto total.'
          toast.add({ title: 'Error', description: msg, color: 'error' })
          return { ok: false, error: new Error(msg) }
        }
        const nueva = await r(cuentasRepo).create({
          clienteId,
          cuadreOrigenId: cuadreId,
          puestoId,
          montoTotal,
          montoPagado: montoPagadoInicial || 0,
          estado: !montoPagadoInicial ? 'pendiente' : montoPagadoInicial >= montoTotal ? 'pagada' : 'parcial'
        })
        for (const it of items) {
          await r(itemsRepo).create({
            cuentaFiadoId: nueva.id,
            productoId: it.productoId,
            cantidad: it.cantidad,
            precioVentaUsado: it.precioVentaUsado,
            subtotal: it.cantidad * it.precioVentaUsado
          })
        }
        if (montoPagadoInicial > 0) {
          // Espejo de server/api/cuentas-fiado/index.post.ts. El cuadreId del
          // pago marca a qué gaveta entró el abono, que es lo que permite
          // revertirlo al borrar la deuda:
          //   - transferencia -> abonó la gaveta de transferencias del cuadre.
          //   - efectivo       -> el jefe lo teclea en "Dinero real en caja", un
          //     campo manual sin registro que revertir; queda cuadreId null.
          // Un cobro posterior SIEMPRE va con cuadreId null (directo).
          const abonoEnTransferencia = formaPagoInicial === 'transferencia'
          await r(pagosRepo).create({
            cuentaFiadoId: nueva.id,
            cuadreId: abonoEnTransferencia ? cuadreId : null,
            monto: montoPagadoInicial,
            formaPago: formaPagoInicial || 'efectivo'
          })
          // Sin fila en `transferencias`: esa tabla es de lo que el jefe
          // captura a mano, y una fila aquí no se podría distinguir de esa al
          // borrar la deuda (no hay FK que las una).
          if (abonoEnTransferencia) {
            await acumularTransferenciaEnCuadre(cuadreId, montoPagadoInicial)
          }
        }
        await acumularFiadoEnCuadre(cuadreId, montoTotal - (montoPagadoInicial || 0))
      }
      await cargarActividadDelCuadre(cuadreId)
      return { ok: true }
    } catch (err) {
      toast.add({ title: 'Error', description: err.data?.statusMessage || err.message, color: 'error' })
      return { ok: false, error: err }
    } finally {
      cargando.value = false
    }
  }

  /**
   * Elimina una cuenta: borra cuenta, líneas y pagos, y revierte en cascada
   * los campos de los cuadres afectados.
   */
  async function eliminarDeuda(cuentaFiadoId, cuadreId) {
    cargando.value = true
    try {
      if (esOnline.value) {
        await $api(`/api/cuentas-fiado/${cuentaFiadoId}`, {
          method: 'DELETE',
          headers: apiHeaders()
        })
      } else {
        const todas = await r(cuentasRepo).readAll()
        const cuenta = todas.find(c => c.id === cuentaFiadoId)
        if (!cuenta) throw new Error('Cuenta no encontrada')

        const todosItems = await r(itemsRepo).readAll()
        const itemsCuenta = todosItems.filter(i => i.cuentaFiadoId === cuentaFiadoId)
        const todosPagos = await r(pagosRepo).readAll()
        const pagosCuenta = todosPagos.filter(p => p.cuentaFiadoId === cuentaFiadoId)

        // Un cuadre cerrado es historia: sus montos son el snapshot de ese día y
        // no se reescriben. Misma regla que cobrarDeuda más abajo. La deuda se
        // borra igual, pero sin tocar las gavetas de un cuadre ya cerrado.
        let origenAbierto = true
        if (cuenta.cuadreOrigenId) {
          const origen = await r(cuadresRepo).read(cuenta.cuadreOrigenId)
          origenAbierto = !origen || origen.estado === 'abierto'
        }

        // Cada gaveta se devuelve por la que entró el dinero. El abono inicial
        // por transferencia viene marcado con cuadreId (ver registrarNuevaDeuda)
        // y es el único pago con esa combinación: los cobros posteriores son
        // directos y van con cuadreId null.
        if (origenAbierto) {
          for (const p of pagosCuenta) {
            if (!p.cuadreId) continue
            if (p.formaPago === 'transferencia') {
              await acumularTransferenciaEnCuadre(p.cuadreId, -Number(p.monto))
            } else {
              await acumularCobroEnCuadre(p.cuadreId, -Number(p.monto))
            }
          }
          const pendiente = Number(cuenta.montoTotal) - Number(cuenta.montoPagado)
          if (pendiente > 0) await acumularFiadoEnCuadre(cuenta.cuadreOrigenId, -pendiente)
        }

        for (const it of itemsCuenta) await r(itemsRepo).remove(it.id)
        for (const p of pagosCuenta) await r(pagosRepo).remove(p.id)
        await r(cuentasRepo).remove(cuentaFiadoId)
      }
      await cargarActividadDelCuadre(cuadreId)
    } catch (err) {
      toast.add({ title: 'Error', description: err.data?.statusMessage || err.message, color: 'error' })
    } finally {
      cargando.value = false
    }
  }

  /**
   * Cobra una deuda, total o parcialmente. Siempre directo (fuera del
   * cuadre): el jefe cobra en físico y ningún cuadre registra el dinero
   * (montoCobradoFiado queda congelado como histórico). Solo baja el saldo
   * de la cuenta; el fiado pendiente del origen baja únicamente si ese
   * cuadre sigue abierto (un cerrado no se reescribe).
   */
  async function cobrarDeuda({ cuentaFiadoId, cuadreId = null, monto, formaPago }) {
    cargando.value = true
    try {
      if (esOnline.value) {
        await $api('/api/pagos-fiado', {
          method: 'POST',
          body: { cuentaFiadoId, cuadreId: null, monto, formaPago },
          headers: apiHeaders()
        })
      } else {
        const todas = await r(cuentasRepo).readAll()
        const cuenta = todas.find(c => c.id === cuentaFiadoId)
        if (!cuenta) throw new Error('Cuenta no encontrada')
        if (cuenta.estado === 'pagada') throw new Error('Esta deuda ya está saldada.')
        const saldo = Number(cuenta.montoTotal) - Number(cuenta.montoPagado)
        if (monto > saldo) throw new Error('El monto excede el saldo pendiente')

        await r(pagosRepo).create({ cuentaFiadoId, cuadreId: null, monto, formaPago })
        const nuevoPagado = Number(cuenta.montoPagado) + monto
        await r(cuentasRepo).update(cuentaFiadoId, {
          montoPagado: nuevoPagado,
          estado: nuevoPagado >= Number(cuenta.montoTotal) ? 'pagada' : 'parcial'
        })
        if (cuenta.cuadreOrigenId) {
          const origen = await r(cuadresRepo).read(cuenta.cuadreOrigenId)
          if (origen && origen.estado === 'abierto') {
            await acumularFiadoEnCuadre(cuenta.cuadreOrigenId, -monto)
          }
        }
      }
      if (cuadreId) await cargarActividadDelCuadre(cuadreId)
      return { ok: true, directo: true }
    } catch (err) {
      toast.add({ title: 'Error', description: err.data?.statusMessage || err.message, color: 'error' })
      return { ok: false, error: err }
    } finally {
      cargando.value = false
    }
  }

  /**
   * Deuda directa: el jefe fía por fuera del cuadre (quiosco cerrado, o sin
   * cuadre abierto). No pasa por el tope ni toca ningún cuadre, pero sí
   * descuenta inventario y congela su costo FIFO en la propia cuenta.
   */
  async function registrarDeudaDirecta({ clienteId, lineas, ubicacion = 'almacen', montoPagadoInicial = 0, formaPagoInicial = 'efectivo' }) {
    cargando.value = true
    try {
      if (esOnline.value) {
        const rpta = await $api('/api/cuentas-fiado/directas', {
          method: 'POST',
          body: { clienteId, lineas, ubicacion, montoPagadoInicial, formaPagoInicial },
          headers: apiHeaders()
        })
        return { ok: true, ...(rpta ?? {}) }
      }
      const pid = auth.usuarioActual.value?.puestoId ?? null
      if (!pid) throw new Error('Sin puesto asignado.')
      const usuarioId = auth.usuarioActual.value?.id ?? null
      const ahora = Date.now()

      const [lotesFilas, movs, prods] = await Promise.all([
        r(lotesRepo).readAll(),
        r(movimientosRepo).readAll(),
        r(productosRepo).readAll()
      ])
      const lotes = lotesFilas.filter(l => l.puestoId === pid && !l.anulado)
      const movimientos = movs.filter(m => m.puestoId === pid && !m.anulado)
      const productos = prods.filter(p => p.puestoId === pid)
      const porId = new Map(productos.map(p => [p.id, p]))

      const ids = [...new Set(lineas.map(l => l.productoId))]
      for (const id of ids) {
        if (!porId.has(id)) throw new Error('Hay productos que no pertenecen a este puesto.')
      }
      const lotesPorProducto = new Map(
        ids.map(id => [id, lotesConSaldo(lotes, movimientos, id, ubicacion)])
      )
      const venta = construirVentaDirecta({
        lineas,
        lotesPorProducto,
        ubicacion,
        motivo: ubicacion === 'almacen' ? 'deuda_directa_almacen' : 'deuda_directa_quiosco',
        meta: { puestoId: pid, usuarioId, ahora }
      })
      if (venta.faltantes.length > 0) {
        const nombres = venta.faltantes.map(f => porId.get(f.productoId)?.nombre ?? f.productoId).join(', ')
        throw new Error(`No hay stock suficiente en ${ubicacion} para: ${nombres}.`)
      }
      if (montoPagadoInicial > venta.montoTotal) {
        throw new Error('El pago inicial no puede superar el monto total.')
      }

      const cuentaId = crypto.randomUUID()
      await db.transaction(async () => {
        await r(cuentasRepo).create({
          id: cuentaId,
          clienteId,
          cuadreOrigenId: null,
          puestoId: pid,
          montoTotal: venta.montoTotal,
          montoPagado: montoPagadoInicial,
          costoTotal: venta.costoTotal,
          ganancia: venta.ganancia,
          estado: !montoPagadoInicial ? 'pendiente' : montoPagadoInicial >= venta.montoTotal ? 'pagada' : 'parcial'
        })
        for (const it of venta.items) {
          await r(itemsRepo).create({
            id: it.id,
            cuentaFiadoId: cuentaId,
            productoId: it.productoId,
            cantidad: it.cantidad,
            precioVentaUsado: it.precioVentaUsado,
            subtotal: it.subtotal
          })
        }
        for (const m of venta.movimientos) await r(movimientosRepo).create(m)
        // El pago inicial de una deuda directa es dinero ya cobrado por el
        // jefe: se guarda como pago directo para no inflar ninguna gaveta.
        if (montoPagadoInicial > 0) {
          await r(pagosRepo).create({
            cuentaFiadoId: cuentaId,
            cuadreId: null,
            monto: montoPagadoInicial,
            formaPago: formaPagoInicial
          })
        }
      })
      return { ok: true, id: cuentaId, montoTotal: venta.montoTotal, ganancia: venta.ganancia }
    } catch (err) {
      toast.add({ title: 'Error', description: err.data?.statusMessage || err.message, color: 'error' })
      return { ok: false, error: err }
    } finally {
      cargando.value = false
    }
  }

  /**
   * Deudas del puesto con el saldo derivado.
   * @param {object} [opts]
   * @param {boolean} [opts.conSaldo=true] false trae también las saldadas.
   * @param {string|null} [opts.clienteId] acota a un cliente (vista de deudas).
   */
  async function cargarDeudas({ conSaldo = true, clienteId = null } = {}) {
    const todas = await r(cuentasRepo).readAll()
    const pid = auth.usuarioActual.value?.puestoId ?? null
    return todas
      .filter(c => (!pid || c.puestoId === pid)
        && (!conSaldo || c.estado !== 'pagada')
        && (!clienteId || c.clienteId === clienteId))
      .map(c => ({
        ...c,
        saldoPendiente: Number(c.montoTotal) - Number(c.montoPagado),
        // cuadreOrigenId null = fiada por fuera del cuadre.
        directa: !c.cuadreOrigenId
      }))
      .sort((a, b) => new Date(b.creadoEn ?? 0) - new Date(a.creadoEn ?? 0))
  }

  /** Historial de pagos de una deuda, para ver qué entró y por dónde. */
  async function pagosDeCuenta(cuentaFiadoId) {
    const todos = await r(pagosRepo).readAll()
    return todos
      .filter(p => p.cuentaFiadoId === cuentaFiadoId)
      .sort((a, b) => new Date(a.creadoEn ?? 0) - new Date(b.creadoEn ?? 0))
  }

  /**
   * Acumula un cobro de fiado en el cuadre donde se recibe el pago
   * (solo modo local; en online lo hace el servidor transaccionalmente).
   * Acepta delta negativo para revertir (edición/eliminación). Piso 0.
   */
  async function acumularCobroEnCuadre(cuadreId, delta) {
    if (esOnline.value || !delta || !cuadreId) return
    const cuadre = await r(cuadresRepo).read(cuadreId)
    if (!cuadre) return
    await r(cuadresRepo).update(cuadreId, {
      montoCobradoFiado: Math.max((Number(cuadre.montoCobradoFiado) || 0) + delta, 0)
    })
  }

  /**
   * Gaveta de transferencias del cuadre. Es la contra del abono inicial de una
   * deuda pagado por transferencia (registrarNuevaDeuda) y su reversión al
   * borrar esa deuda (eliminarDeuda). Solo local; en online lo hace el
   * servidor transaccionalmente. Piso 0.
   */
  async function acumularTransferenciaEnCuadre(cuadreId, delta) {
    if (esOnline.value || !delta || !cuadreId) return
    const cuadre = await r(cuadresRepo).read(cuadreId)
    if (!cuadre) return
    await r(cuadresRepo).update(cuadreId, {
      montoTransferencia: Math.max((Number(cuadre.montoTransferencia) || 0) + delta, 0)
    })
  }

  /**
   * Ajusta el fiado pendiente de un cuadre (solo modo local; en online lo
   * hace el servidor transaccionalmente). Positivo al generar deuda (en el
   * cuadre de origen), negativo al cobrar (también en el origen, aunque el
   * cobro entre en otro cuadre). Piso 0 por registros anteriores al ajuste.
   */
  async function acumularFiadoEnCuadre(cuadreId, delta) {
    // Las deudas directas no tienen cuadre de origen: su saldo baja solo.
    if (esOnline.value || !delta || !cuadreId) return
    const cuadre = await r(cuadresRepo).read(cuadreId)
    if (!cuadre) return
    await r(cuadresRepo).update(cuadreId, {
      montoFiado: Math.max((Number(cuadre.montoFiado) || 0) + delta, 0)
    })
  }

  async function cuentasConSaldoPendiente() {
    const todas = await r(cuentasRepo).readAll()
    return todas.filter(c => c.estado !== 'pagada')
  }

  return {
    clientes, cuentasDelCuadre, pagosDelCuadre, cargando,
    montoFiadoCalculado, montoCobradoFiadoCalculado,
    cargarClientes, cargarActividadDelCuadre, crearCliente,
    registrarNuevaDeuda, registrarDeudaDirecta, eliminarDeuda, cobrarDeuda,
    cuentasConSaldoPendiente, cargarDeudas, pagosDeCuenta
  }
}
