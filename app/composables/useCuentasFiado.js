import { TABLES } from '../../shared/tables'
import { $api } from '../utils/api'
import { calcularExcesoTope, sumarPorProducto } from '../../shared/fiadoTope'

const usuarioConfig = TABLES.usuarios
const cuentaFiadoConfig = TABLES.cuentas_fiado
const cuentaFiadoItemConfig = TABLES.cuentas_fiado_items
const pagoFiadoConfig = TABLES.pagos_fiado
const cuadreConfig = TABLES.cuadres
const cuadreItemConfig = TABLES.cuadre_items

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
  const usuariosRepo = computed(() => esOnline.value ? useRemoteRepo(usuarioConfig) : useLocalRepo(usuarioConfig))
  const cuentasRepo = computed(() => esOnline.value ? useRemoteRepo(cuentaFiadoConfig) : useLocalRepo(cuentaFiadoConfig))
  const itemsRepo = computed(() => esOnline.value ? useRemoteRepo(cuentaFiadoItemConfig) : useLocalRepo(cuentaFiadoItemConfig))
  const pagosRepo = computed(() => esOnline.value ? useRemoteRepo(pagoFiadoConfig) : useLocalRepo(pagoFiadoConfig))
  const cuadresRepo = computed(() => esOnline.value ? useRemoteRepo(cuadreConfig) : useLocalRepo(cuadreConfig))
  const cuadreItemsRepo = computed(() => esOnline.value ? useRemoteRepo(cuadreItemConfig) : useLocalRepo(cuadreItemConfig))

  function r(repo) {
    return repo.value
  }

  const clientes = ref([])
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

  async function cargarClientes(puestoId) {
    const todos = await r(usuariosRepo).readAll()
    clientes.value = todos.filter(c => c.puestoId === puestoId && c.activo)
  }

  async function cargarActividadDelCuadre(cuadreId) {
    const todasCuentas = await r(cuentasRepo).readAll()
    cuentasDelCuadre.value = todasCuentas.filter(c => c.cuadreOrigenId === cuadreId)
    const todosPagos = await r(pagosRepo).readAll()
    pagosDelCuadre.value = todosPagos.filter(p => p.cuadreId === cuadreId)
  }

  async function crearCliente(data, puestoId) {
    // PIN aleatorio criptográfico si el jefe no lo especifica
    const pin = data.pin || String(crypto.getRandomValues(new Uint16Array(1))[0] % 9000 + 1000)
    // eslint-disable-next-line no-unused-vars, @typescript-eslint/no-unused-vars
    const { pin: _unused, ...rest } = data
    const nuevo = await r(usuariosRepo).create({ ...rest, puestoId, rol: 'cliente', pin })
    clientes.value.push(nuevo)
    return nuevo
  }

  /**
   * Cantidades vendidas por producto en el cuadre (líneas del cuadre).
   */
  async function vendidosPorProducto(cuadreId) {
    const items = await r(cuadreItemsRepo).readAll({ query: { cuadreId } })
    return sumarPorProducto(items)
  }

  /**
   * Cantidades ya fiadas por producto en el cuadre (todas las cuentas de
   * origen, salvo las excluidas).
   */
  async function fiadosPorProducto(cuadreId, excluirCuentaIds = []) {
    const todasCuentas = await r(cuentasRepo).readAll()
    const delCuadre = todasCuentas.filter(c => c.cuadreOrigenId === cuadreId && !excluirCuentaIds.includes(c.id))
    const ids = delCuadre.map(c => c.id)
    if (ids.length === 0) return new Map()
    const todosItems = await r(itemsRepo).readAll()
    return sumarPorProducto(todosItems.filter(i => ids.includes(i.cuentaFiadoId)))
  }

  /**
   * Valida el tope de fiado (solo modo local; en online lo hace el servidor).
   * Devuelve mensaje de error o null si cabe.
   */
  async function validarTopeLocal(cuadreId, items, excluirCuentaIds = []) {
    if (esOnline.value) return null
    const [vendidos, fiados] = await Promise.all([
      vendidosPorProducto(cuadreId),
      fiadosPorProducto(cuadreId, excluirCuentaIds)
    ])
    const exceso = calcularExcesoTope(vendidos, fiados, items)
    if (!exceso) return null
    const yaFiado = Number(fiados.get(exceso.productoId) ?? 0)
    return `Tope de fiado excedido: quedan ${exceso.disponible} unidades disponibles de este producto (vendido ${exceso.disponible + yaFiado}).`
  }

  async function registrarNuevaDeuda({ clienteId, cuadreId, items, montoPagadoInicial, formaPagoInicial, puestoId }) {
    cargando.value = true
    try {
      const topeMsg = await validarTopeLocal(cuadreId, items)
      if (topeMsg) {
        toast.add({ title: 'Error', description: topeMsg, color: 'error' })
        return
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
          await r(pagosRepo).create({
            cuentaFiadoId: nueva.id,
            cuadreId,
            monto: montoPagadoInicial,
            formaPago: formaPagoInicial || 'efectivo'
          })
          await acumularCobroEnCuadre(cuadreId, montoPagadoInicial)
        }
        await acumularFiadoEnCuadre(cuadreId, montoTotal - (montoPagadoInicial || 0))
      }
      await cargarActividadDelCuadre(cuadreId)
    } catch (err) {
      toast.add({ title: 'Error', description: err.data?.statusMessage || err.message, color: 'error' })
    } finally {
      cargando.value = false
    }
  }

  /**
   * Edita una cuenta pendiente: cambia productos/cantidades conservando el
   * precio congelado de las líneas existentes.
   */
  async function editarDeuda({ cuentaFiadoId, items, cuadreId }) {
    cargando.value = true
    try {
      if (esOnline.value) {
        await $api(`/api/cuentas-fiado/${cuentaFiadoId}`, {
          method: 'PATCH',
          body: { items },
          headers: apiHeaders()
        })
      } else {
        const todas = await r(cuentasRepo).readAll()
        const cuenta = todas.find(c => c.id === cuentaFiadoId)
        if (!cuenta) throw new Error('Cuenta no encontrada')
        if (cuenta.estado === 'pagada') throw new Error('La cuenta ya está pagada y no se puede editar.')

        const topeMsg = await validarTopeLocal(cuenta.cuadreOrigenId, items, [cuentaFiadoId])
        if (topeMsg) {
          toast.add({ title: 'Error', description: topeMsg, color: 'error' })
          return
        }

        // Precios congelados: líneas existentes conservan su precio.
        const existentes = await r(itemsRepo).readAll()
        const itemsActuales = existentes.filter(i => i.cuentaFiadoId === cuentaFiadoId)
        const preciosAnteriores = new Map(itemsActuales.map(i => [i.productoId, Number(i.precioVentaUsado)]))
        const itemsFinales = items.map((it) => {
          const congelado = preciosAnteriores.get(it.productoId)
          const precio = congelado != null ? congelado : Number(it.precioVentaUsado)
          return { ...it, precioVentaUsado: precio, subtotal: Number(it.cantidad) * precio }
        })

        const nuevoTotal = itemsFinales.reduce((s, it) => s + it.subtotal, 0)
        if (nuevoTotal < Number(cuenta.montoPagado)) {
          throw new Error(`El nuevo total (${nuevoTotal}) no puede ser menor a lo ya pagado (${cuenta.montoPagado}).`)
        }

        const pendienteAnterior = Number(cuenta.montoTotal) - Number(cuenta.montoPagado)
        const pendienteNuevo = nuevoTotal - Number(cuenta.montoPagado)

        // Sincroniza las líneas de la cuenta: actualizar, crear o borrar.
        const anterioresMap = new Map(itemsActuales.map(i => [i.productoId, i]))
        const nuevosSet = new Set(itemsFinales.map(i => i.productoId))
        for (const antiguo of itemsActuales) {
          if (!nuevosSet.has(antiguo.productoId)) {
            await r(itemsRepo).remove(antiguo.id)
          }
        }
        for (const it of itemsFinales) {
          const anterior = anterioresMap.get(it.productoId)
          if (anterior) {
            if (Number(anterior.cantidad) !== Number(it.cantidad)) {
              await r(itemsRepo).update(anterior.id, {
                cantidad: it.cantidad,
                subtotal: it.subtotal
              })
            }
          } else {
            await r(itemsRepo).create({
              cuentaFiadoId,
              productoId: it.productoId,
              cantidad: it.cantidad,
              precioVentaUsado: it.precioVentaUsado,
              subtotal: it.subtotal
            })
          }
        }

        await r(cuentasRepo).update(cuentaFiadoId, {
          montoTotal: nuevoTotal,
          estado: Number(cuenta.montoPagado) >= nuevoTotal ? 'pagada' : Number(cuenta.montoPagado) > 0 ? 'parcial' : 'pendiente'
        })

        const delta = pendienteNuevo - pendienteAnterior
        if (delta !== 0) await acumularFiadoEnCuadre(cuenta.cuadreOrigenId, delta)
      }
      await cargarActividadDelCuadre(cuadreId)
    } catch (err) {
      toast.add({ title: 'Error', description: err.data?.statusMessage || err.message, color: 'error' })
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

        for (const p of pagosCuenta) {
          await acumularCobroEnCuadre(p.cuadreId, -Number(p.monto))
        }
        const pendiente = Number(cuenta.montoTotal) - Number(cuenta.montoPagado)
        if (pendiente > 0) await acumularFiadoEnCuadre(cuenta.cuadreOrigenId, -pendiente)

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

  async function cobrarDeuda({ cuentaFiadoId, cuadreId, monto, formaPago }) {
    cargando.value = true
    try {
      if (esOnline.value) {
        await $api('/api/pagos-fiado', {
          method: 'POST',
          body: { cuentaFiadoId, cuadreId, monto, formaPago },
          headers: apiHeaders()
        })
      } else {
        const todas = await r(cuentasRepo).readAll()
        const cuenta = todas.find(c => c.id === cuentaFiadoId)
        if (!cuenta) throw new Error('Cuenta no encontrada')
        const saldo = Number(cuenta.montoTotal) - Number(cuenta.montoPagado)
        if (monto > saldo) throw new Error('El monto excede el saldo pendiente')

        await r(pagosRepo).create({ cuentaFiadoId, cuadreId, monto, formaPago })
        const nuevoPagado = Number(cuenta.montoPagado) + monto
        await r(cuentasRepo).update(cuentaFiadoId, {
          montoPagado: nuevoPagado,
          estado: nuevoPagado >= Number(cuenta.montoTotal) ? 'pagada' : 'parcial'
        })
        await acumularCobroEnCuadre(cuadreId, monto)
        await acumularFiadoEnCuadre(cuenta.cuadreOrigenId, -monto)
      }
      await cargarActividadDelCuadre(cuadreId)
    } catch (err) {
      toast.add({ title: 'Error', description: err.data?.statusMessage || err.message, color: 'error' })
    } finally {
      cargando.value = false
    }
  }

  /**
   * Acumula un cobro de fiado en el cuadre donde se recibe el pago
   * (solo modo local; en online lo hace el servidor transaccionalmente).
   * Acepta delta negativo para revertir (edición/eliminación). Piso 0.
   */
  async function acumularCobroEnCuadre(cuadreId, delta) {
    if (esOnline.value || !delta) return
    const cuadre = await r(cuadresRepo).read(cuadreId)
    if (!cuadre) return
    await r(cuadresRepo).update(cuadreId, {
      montoCobradoFiado: Math.max((Number(cuadre.montoCobradoFiado) || 0) + delta, 0)
    })
  }

  /**
   * Ajusta el fiado pendiente de un cuadre (solo modo local; en online lo
   * hace el servidor transaccionalmente). Positivo al generar deuda (en el
   * cuadre de origen), negativo al cobrar (también en el origen, aunque el
   * cobro entre en otro cuadre). Piso 0 por registros anteriores al ajuste.
   */
  async function acumularFiadoEnCuadre(cuadreId, delta) {
    if (esOnline.value || !delta) return
    const cuadre = await r(cuadresRepo).read(cuadreId)
    if (!cuadre) return
    await r(cuadresRepo).update(cuadreId, {
      montoFiado: Math.max((Number(cuadre.montoFiado) || 0) + delta, 0)
    })
  }

  async function itemsDeCuenta(cuentaFiadoId) {
    const todos = await r(itemsRepo).readAll()
    return todos.filter(i => i.cuentaFiadoId === cuentaFiadoId)
  }

  async function cuentasConSaldoPendiente() {
    const todas = await r(cuentasRepo).readAll()
    return todas.filter(c => c.estado !== 'pagada')
  }

  return {
    clientes, cuentasDelCuadre, pagosDelCuadre, cargando,
    montoFiadoCalculado, montoCobradoFiadoCalculado,
    cargarClientes, cargarActividadDelCuadre, crearCliente,
    registrarNuevaDeuda, editarDeuda, eliminarDeuda, cobrarDeuda,
    itemsDeCuenta, cuentasConSaldoPendiente
  }
}
