import { TABLES } from '../../shared/tables'
import { $api } from '../utils/api'
import { validarTopeGeneralLocal } from '../utils/topeGeneral'

const transferenciaConfig = TABLES.transferencias
const transferenciaItemConfig = TABLES.transferencia_items
const usuarioConfig = TABLES.usuarios
const cuadreConfig = TABLES.cuadres
const cuadreItemConfig = TABLES.cuadre_items
const cuentaFiadoConfig = TABLES.cuentas_fiado
const cuentaFiadoItemConfig = TABLES.cuentas_fiado_items
const ajusteConfig = TABLES.ajustes

export function useTransferencias() {
  const toast = useToast()
  const conexion = useModoConexion()
  const esOnline = computed(() => conexion.modo.value === 'online')
  const auth = useAuth()

  function apiHeaders() {
    const token = auth.jwtSync.value
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  const usuariosRepo = computed(() => esOnline.value ? useRemoteRepo(usuarioConfig) : useLocalRepo(usuarioConfig))
  const transferenciasRepo = computed(() => esOnline.value ? useRemoteRepo(transferenciaConfig) : useLocalRepo(transferenciaConfig))
  const itemsRepo = computed(() => esOnline.value ? useRemoteRepo(transferenciaItemConfig) : useLocalRepo(transferenciaItemConfig))
  const cuadresRepo = computed(() => esOnline.value ? useRemoteRepo(cuadreConfig) : useLocalRepo(cuadreConfig))
  const cuadreItemsRepo = computed(() => esOnline.value ? useRemoteRepo(cuadreItemConfig) : useLocalRepo(cuadreItemConfig))
  const cuentasRepo = computed(() => esOnline.value ? useRemoteRepo(cuentaFiadoConfig) : useLocalRepo(cuentaFiadoConfig))
  const cuentasItemsRepo = computed(() => esOnline.value ? useRemoteRepo(cuentaFiadoItemConfig) : useLocalRepo(cuentaFiadoItemConfig))
  const ajustesRepo = computed(() => esOnline.value ? useRemoteRepo(ajusteConfig) : useLocalRepo(ajusteConfig))

  function r(repo) {
    return repo.value
  }

  const clientes = ref([])
  const transferenciasDelCuadre = ref([])
  const cargando = ref(false)

  const montoTransferenciaCalculado = computed(() =>
    transferenciasDelCuadre.value.reduce((sum, t) => sum + Number(t.montoTotal || 0), 0)
  )

  async function cargarClientes(puestoId) {
    const todos = await r(usuariosRepo).readAll()
    clientes.value = todos.filter(c => c.puestoId === puestoId && c.activo)
  }

  async function crearCliente(data, puestoId) {
    const pin = data.pin || String(crypto.getRandomValues(new Uint16Array(1))[0] % 9000 + 1000)
    // eslint-disable-next-line no-unused-vars, @typescript-eslint/no-unused-vars
    const { pin: _unused, ...rest } = data
    const nuevo = await r(usuariosRepo).create({ ...rest, puestoId, rol: 'cliente', pin })
    clientes.value.push(nuevo)
    return nuevo
  }

  async function cargarActividadDelCuadre(cuadreId) {
    const { data: todas } = await r(transferenciasRepo).readAll({ query: { cuadreId } })
    transferenciasDelCuadre.value = Array.isArray(todas) ? todas.filter(t => t.cuadreId === cuadreId) : []
  }

  function reposTopeLocal() {
    return {
      cuadreItemsRepo: r(cuadreItemsRepo),
      cuentasRepo: r(cuentasRepo),
      cuentasItemsRepo: r(cuentasItemsRepo),
      transferenciasRepo: r(transferenciasRepo),
      transferenciaItemsRepo: r(itemsRepo),
      ajustesRepo: r(ajustesRepo)
    }
  }

  async function validarTopeLocal(cuadreId, items, excluirTransferenciaId = null) {
    if (esOnline.value) return null
    return validarTopeGeneralLocal({
      cuadreId,
      items,
      repos: reposTopeLocal(),
      excluir: { transferenciaIds: excluirTransferenciaId ? [excluirTransferenciaId] : [] },
      concepto: 'transferencia'
    })
  }

  async function registrarTransferencia({ clienteId, cuadreId, items, puestoId }) {
    cargando.value = true
    try {
      const topeMsg = await validarTopeLocal(cuadreId, items)
      if (topeMsg) {
        toast.add({ title: 'Error', description: topeMsg, color: 'error' })
        return
      }
      if (esOnline.value) {
        await $api('/api/transferencias', {
          method: 'POST',
          body: { clienteId, cuadreId, items },
          headers: apiHeaders()
        })
      } else {
        const montoTotal = items.reduce((s, it) => s + it.cantidad * it.precioVentaUsado, 0)
        if (montoTotal <= 0) throw new Error('El monto de la transferencia debe ser mayor que cero.')
        const nueva = await r(transferenciasRepo).create({
          clienteId,
          cuadreId,
          puestoId,
          montoTotal
        })
        for (const it of items) {
          await r(itemsRepo).create({
            transferenciaId: nueva.id,
            productoId: it.productoId,
            cantidad: it.cantidad,
            precioVentaUsado: it.precioVentaUsado,
            subtotal: it.cantidad * it.precioVentaUsado
          })
        }
        await acumularTransferenciaEnCuadre(cuadreId, montoTotal)
      }
      await cargarActividadDelCuadre(cuadreId)
    } catch (err) {
      toast.add({ title: 'Error', description: err.data?.statusMessage || err.message, color: 'error' })
    } finally {
      cargando.value = false
    }
  }

  async function editarTransferencia({ transferenciaId, items, cuadreId }) {
    cargando.value = true
    try {
      const topeMsg = await validarTopeLocal(cuadreId, items, transferenciaId)
      if (topeMsg) {
        toast.add({ title: 'Error', description: topeMsg, color: 'error' })
        return
      }
      if (esOnline.value) {
        await $api(`/api/transferencias/${transferenciaId}`, {
          method: 'PATCH',
          body: { items },
          headers: apiHeaders()
        })
      } else {
        const todas = await r(transferenciasRepo).readAll()
        const transferencia = todas.find(t => t.id === transferenciaId)
        if (!transferencia) throw new Error('Transferencia no encontrada')

        const existentes = await r(itemsRepo).readAll()
        const itemsActuales = existentes.filter(i => i.transferenciaId === transferenciaId)
        const preciosAnteriores = new Map(itemsActuales.map(i => [i.productoId, Number(i.precioVentaUsado)]))
        const itemsFinales = items.map((it) => {
          const congelado = preciosAnteriores.get(it.productoId)
          const precio = congelado != null ? congelado : Number(it.precioVentaUsado)
          return { ...it, precioVentaUsado: precio, subtotal: Number(it.cantidad) * precio }
        })

        const nuevoTotal = itemsFinales.reduce((s, it) => s + it.subtotal, 0)
        if (nuevoTotal <= 0) throw new Error('El monto de la transferencia debe ser mayor que cero.')

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
              transferenciaId,
              productoId: it.productoId,
              cantidad: it.cantidad,
              precioVentaUsado: it.precioVentaUsado,
              subtotal: it.subtotal
            })
          }
        }

        await r(transferenciasRepo).update(transferenciaId, { montoTotal: nuevoTotal })

        const delta = nuevoTotal - Number(transferencia.montoTotal)
        if (delta !== 0) await acumularTransferenciaEnCuadre(cuadreId, delta)
      }
      await cargarActividadDelCuadre(cuadreId)
    } catch (err) {
      toast.add({ title: 'Error', description: err.data?.statusMessage || err.message, color: 'error' })
    } finally {
      cargando.value = false
    }
  }

  async function eliminarTransferencia(transferenciaId, cuadreId) {
    cargando.value = true
    try {
      if (esOnline.value) {
        await $api(`/api/transferencias/${transferenciaId}`, {
          method: 'DELETE',
          headers: apiHeaders()
        })
      } else {
        const todas = await r(transferenciasRepo).readAll()
        const transferencia = todas.find(t => t.id === transferenciaId)
        if (!transferencia) throw new Error('Transferencia no encontrada')

        const todosItems = await r(itemsRepo).readAll()
        const itemsTransf = todosItems.filter(i => i.transferenciaId === transferenciaId)

        await acumularTransferenciaEnCuadre(cuadreId, -Number(transferencia.montoTotal))

        for (const it of itemsTransf) await r(itemsRepo).remove(it.id)
        await r(transferenciasRepo).remove(transferenciaId)
      }
      await cargarActividadDelCuadre(cuadreId)
    } catch (err) {
      toast.add({ title: 'Error', description: err.data?.statusMessage || err.message, color: 'error' })
    } finally {
      cargando.value = false
    }
  }

  async function itemsDeTransferencia(transferenciaId) {
    const todos = await r(itemsRepo).readAll()
    return todos.filter(i => i.transferenciaId === transferenciaId)
  }

  async function acumularTransferenciaEnCuadre(cuadreId, delta) {
    if (esOnline.value || !delta) return
    const cuadre = await r(cuadresRepo).read(cuadreId)
    if (!cuadre) return
    await r(cuadresRepo).update(cuadreId, {
      montoTransferencia: Math.max((Number(cuadre.montoTransferencia) || 0) + delta, 0)
    })
  }

  return {
    clientes, transferenciasDelCuadre, cargando,
    montoTransferenciaCalculado,
    cargarClientes, crearCliente, cargarActividadDelCuadre,
    registrarTransferencia, editarTransferencia, eliminarTransferencia,
    itemsDeTransferencia
  }
}
