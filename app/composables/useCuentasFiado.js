import { TABLES } from '../../shared/tables'
import { $api } from '../utils/api'

const usuarioConfig = TABLES.usuarios
const cuentaFiadoConfig = TABLES.cuentas_fiado
const cuentaFiadoItemConfig = TABLES.cuentas_fiado_items
const pagoFiadoConfig = TABLES.pagos_fiado
const cuadreConfig = TABLES.cuadres

export function useCuentasFiado() {
  const toast = useToast()
  const conexion = useModoConexion()
  const esOnline = computed(() => conexion.modo.value === 'online')

  // Repos mode-aware (online → API remota, local → SQLite)
  const usuariosRepo = computed(() => esOnline.value ? useRemoteRepo(usuarioConfig) : useLocalRepo(usuarioConfig))
  const cuentasRepo = computed(() => esOnline.value ? useRemoteRepo(cuentaFiadoConfig) : useLocalRepo(cuentaFiadoConfig))
  const itemsRepo = computed(() => esOnline.value ? useRemoteRepo(cuentaFiadoItemConfig) : useLocalRepo(cuentaFiadoItemConfig))
  const pagosRepo = computed(() => esOnline.value ? useRemoteRepo(pagoFiadoConfig) : useLocalRepo(pagoFiadoConfig))
  const cuadresRepo = computed(() => esOnline.value ? useRemoteRepo(cuadreConfig) : useLocalRepo(cuadreConfig))

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
   * Acumula un cobro de fiado en el cuadre donde se recibe el pago
   * (solo modo local; en online lo hace el servidor transaccionalmente).
   */
  async function acumularCobroEnCuadre(cuadreId, monto) {
    if (esOnline.value) return
    const cuadre = await r(cuadresRepo).read(cuadreId)
    if (!cuadre) return
    await r(cuadresRepo).update(cuadreId, {
      montoCobradoFiado: (Number(cuadre.montoCobradoFiado) || 0) + monto
    })
  }

  async function registrarNuevaDeuda({ clienteId, cuadreId, items, montoPagadoInicial, formaPagoInicial, puestoId }) {
    cargando.value = true
    try {
      if (esOnline.value) {
        // Endpoint transaccional del servidor (cuenta + items + pago inicial + cuadre)
        await $api('/api/cuentas-fiado', {
          method: 'POST',
          body: { clienteId, cuadreOrigenId: cuadreId, items, montoPagadoInicial: montoPagadoInicial || 0, formaPagoInicial: formaPagoInicial || 'efectivo' }
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
      }
      await cargarActividadDelCuadre(cuadreId)
      toast.add({ title: 'Deuda registrada', color: 'success' })
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
          body: { cuentaFiadoId, cuadreId, monto, formaPago }
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
      }
      await cargarActividadDelCuadre(cuadreId)
      toast.add({ title: 'Pago registrado', color: 'success' })
    } catch (err) {
      toast.add({ title: 'Error', description: err.data?.statusMessage || err.message, color: 'error' })
    } finally {
      cargando.value = false
    }
  }

  async function cuentasConSaldoPendiente() {
    const todas = await r(cuentasRepo).readAll()
    return todas.filter(c => c.estado !== 'pagada')
  }

  return {
    clientes, cuentasDelCuadre, pagosDelCuadre, cargando,
    montoFiadoCalculado, montoCobradoFiadoCalculado,
    cargarClientes, cargarActividadDelCuadre, crearCliente,
    registrarNuevaDeuda, cobrarDeuda, cuentasConSaldoPendiente
  }
}
