export function useCuentasFiado() {
  const auth = useAuth()
  const toast = useToast()
  const clientesRepo = useRepo('clientes')
  const cuentasRepo = useRepo('cuentas_fiado')
  const itemsRepo = useRepo('cuentas_fiado_items')
  const pagosRepo = useRepo('pagos_fiado')

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
    const todos = await clientesRepo.readAll()
    clientes.value = todos.filter(c => c.puestoId === puestoId && c.activo)
  }

  async function cargarActividadDelCuadre(cuadreId) {
    const todasCuentas = await cuentasRepo.readAll()
    cuentasDelCuadre.value = todasCuentas.filter(c => c.cuadreOrigenId === cuadreId)
    const todosPagos = await pagosRepo.readAll()
    pagosDelCuadre.value = todosPagos.filter(p => p.cuadreId === cuadreId)
  }

  async function crearCliente(nombre, puestoId) {
    const nuevo = await clientesRepo.create({ puestoId, nombre, activo: true })
    clientes.value.push(nuevo)
    return nuevo
  }

  async function registrarNuevaDeuda({ clienteId, cuadreId, items, montoPagadoInicial, formaPagoInicial }) {
    cargando.value = true
    try {
      const montoTotal = items.reduce((s, it) => s + it.cantidad * it.precioVentaUsado, 0)
      const nueva = await cuentasRepo.create({
        clienteId,
        cuadreOrigenId: cuadreId,
        montoTotal,
        montoPagado: montoPagadoInicial || 0,
        estado: !montoPagadoInicial ? 'pendiente' : montoPagadoInicial >= montoTotal ? 'pagada' : 'parcial'
      })
      for (const it of items) {
        await itemsRepo.create({
          cuentaFiadoId: nueva.id,
          productoId: it.productoId,
          cantidad: it.cantidad,
          precioVentaUsado: it.precioVentaUsado,
          subtotal: it.cantidad * it.precioVentaUsado
        })
      }
      if (montoPagadoInicial > 0) {
        await pagosRepo.create({
          cuentaFiadoId: nueva.id,
          cuadreId,
          monto: montoPagadoInicial,
          formaPago: formaPagoInicial || 'efectivo'
        })
      }
      await cargarActividadDelCuadre(cuadreId)
      toast.add({ title: 'Deuda registrada', color: 'success' })
    } catch (err) {
      toast.add({ title: 'Error', description: err.message, color: 'error' })
    } finally {
      cargando.value = false
    }
  }

  async function cobrarDeuda({ cuentaFiadoId, cuadreId, monto, formaPago }) {
    cargando.value = true
    try {
      const todas = await cuentasRepo.readAll()
      const cuenta = todas.find(c => c.id === cuentaFiadoId)
      if (!cuenta) throw new Error('Cuenta no encontrada')
      const saldo = Number(cuenta.montoTotal) - Number(cuenta.montoPagado)
      if (monto > saldo) throw new Error('El monto excede el saldo pendiente')

      await pagosRepo.create({ cuentaFiadoId, cuadreId, monto, formaPago })
      const nuevoPagado = Number(cuenta.montoPagado) + monto
      await cuentasRepo.update(cuentaFiadoId, {
        montoPagado: nuevoPagado,
        estado: nuevoPagado >= Number(cuenta.montoTotal) ? 'pagada' : 'parcial'
      })
      await cargarActividadDelCuadre(cuadreId)
      toast.add({ title: 'Pago registrado', color: 'success' })
    } catch (err) {
      toast.add({ title: 'Error', description: err.message, color: 'error' })
    } finally {
      cargando.value = false
    }
  }

  async function cuentasConSaldoPendiente() {
    const todas = await cuentasRepo.readAll()
    return todas.filter(c => c.estado !== 'pagada')
  }

  return {
    clientes, cuentasDelCuadre, pagosDelCuadre, cargando,
    montoFiadoCalculado, montoCobradoFiadoCalculado,
    cargarClientes, cargarActividadDelCuadre, crearCliente,
    registrarNuevaDeuda, cobrarDeuda, cuentasConSaldoPendiente
  }
}
