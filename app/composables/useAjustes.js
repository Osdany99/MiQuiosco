import { TABLES } from '../../shared/tables'
import { $api } from '../utils/api'
import { validarTopeGeneralLocal } from '../utils/topeGeneral'

const ajusteConfig = TABLES.ajustes
const productoConfig = TABLES.productos
const cuadreConfig = TABLES.cuadres
const cuadreItemConfig = TABLES.cuadre_items
const cuentaFiadoConfig = TABLES.cuentas_fiado
const cuentaFiadoItemConfig = TABLES.cuentas_fiado_items
const transferenciaConfig = TABLES.transferencias
const transferenciaItemConfig = TABLES.transferencia_items

export function useAjustes() {
  const toast = useToast()
  const conexion = useModoConexion()
  const esOnline = computed(() => conexion.modo.value === 'online')
  const auth = useAuth()

  function apiHeaders() {
    const token = auth.jwtSync.value
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  const productosRepo = computed(() => esOnline.value ? useRemoteRepo(productoConfig) : useLocalRepo(productoConfig))
  const ajustesRepo = computed(() => esOnline.value ? useRemoteRepo(ajusteConfig) : useLocalRepo(ajusteConfig))
  const cuadresRepo = computed(() => esOnline.value ? useRemoteRepo(cuadreConfig) : useLocalRepo(cuadreConfig))
  const cuadreItemsRepo = computed(() => esOnline.value ? useRemoteRepo(cuadreItemConfig) : useLocalRepo(cuadreItemConfig))
  const cuentasRepo = computed(() => esOnline.value ? useRemoteRepo(cuentaFiadoConfig) : useLocalRepo(cuentaFiadoConfig))
  const cuentasItemsRepo = computed(() => esOnline.value ? useRemoteRepo(cuentaFiadoItemConfig) : useLocalRepo(cuentaFiadoItemConfig))
  const transferenciasRepo = computed(() => esOnline.value ? useRemoteRepo(transferenciaConfig) : useLocalRepo(transferenciaConfig))
  const transferenciaItemsRepo = computed(() => esOnline.value ? useRemoteRepo(transferenciaItemConfig) : useLocalRepo(transferenciaItemConfig))

  function r(repo) {
    return repo.value
  }

  const { clientes, cargarClientes, crearCliente } = useClientes()
  const productos = ref([])
  const ajustesDelCuadre = ref([])
  const cargando = ref(false)

  const montoRegaloCalculado = computed(() =>
    ajustesDelCuadre.value.filter(a => a.tipo === 'regalo').reduce((sum, a) => sum + Number(a.monto || 0), 0)
  )

  const montoDescuentoCalculado = computed(() =>
    ajustesDelCuadre.value.filter(a => a.tipo === 'descuento').reduce((sum, a) => sum + Number(a.monto || 0), 0)
  )

  async function cargarProductos(puestoId) {
    const todos = await r(productosRepo).readAll()
    productos.value = todos.filter(p => p.activo && (p.puestoId === puestoId || !p.puestoId))
    productos.value.sort((a, b) => Number(a.orden ?? 0) - Number(b.orden ?? 0))
  }

  async function cargarActividadDelCuadre(cuadreId) {
    const { data: todas } = await r(ajustesRepo).readAll({ query: { cuadreId } })
    ajustesDelCuadre.value = Array.isArray(todas) ? todas.filter(a => a.cuadreId === cuadreId) : []
  }

  function reposTopeLocal() {
    return {
      cuadreItemsRepo: r(cuadreItemsRepo),
      cuentasRepo: r(cuentasRepo),
      cuentasItemsRepo: r(cuentasItemsRepo),
      transferenciasRepo: r(transferenciasRepo),
      transferenciaItemsRepo: r(transferenciaItemsRepo),
      ajustesRepo: r(ajustesRepo)
    }
  }

  async function validarTopeLocal(cuadreId, items, excluirAjusteId = null) {
    if (esOnline.value) return null
    return validarTopeGeneralLocal({
      cuadreId,
      items,
      repos: reposTopeLocal(),
      excluir: { ajusteIds: excluirAjusteId ? [excluirAjusteId] : [] },
      concepto: 'este ajuste'
    })
  }

  async function registrarAjuste({ cuadreId, clienteId, productoId, tipo, cantidad, monto, nota, puestoId }) {
    cargando.value = true
    try {
      const topeMsg = await validarTopeLocal(cuadreId, [{ productoId, cantidad }])
      if (topeMsg) {
        toast.add({ title: 'Error', description: topeMsg, color: 'error' })
        return { ok: false, error: new Error(topeMsg) }
      }
      if (esOnline.value) {
        await $api('/api/ajustes', {
          method: 'POST',
          body: { cuadreId, clienteId, productoId, tipo, cantidad, monto, nota },
          headers: apiHeaders()
        })
      } else {
        await r(ajustesRepo).create({ cuadreId, clienteId, productoId, tipo, cantidad, monto, nota, puestoId })
        await acumularAjusteEnCuadre(cuadreId, tipo, monto)
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

  async function editarAjuste({ ajusteId, cambios, cuadreId }) {
    cargando.value = true
    try {
      const ajuste = (await r(ajustesRepo).readAll()).find(a => a.id === ajusteId)
      if (!ajuste) throw new Error('Ajuste no encontrado')
      const nuevoTipo = cambios.tipo ?? ajuste.tipo
      const nuevoProductoId = cambios.productoId ?? ajuste.productoId
      const nuevaCantidad = cambios.cantidad ?? ajuste.cantidad
      const nuevoMonto = cambios.monto ?? ajuste.monto

      const topeMsg = await validarTopeLocal(cuadreId, [{ productoId: nuevoProductoId, cantidad: nuevaCantidad }], ajusteId)
      if (topeMsg) {
        toast.add({ title: 'Error', description: topeMsg, color: 'error' })
        return { ok: false, error: new Error(topeMsg) }
      }

      if (esOnline.value) {
        await $api(`/api/ajustes/${ajusteId}`, {
          method: 'PATCH',
          body: cambios,
          headers: apiHeaders()
        })
      } else {
        await r(ajustesRepo).update(ajusteId, {
          clienteId: cambios.clienteId !== undefined ? cambios.clienteId : ajuste.clienteId,
          productoId: nuevoProductoId,
          tipo: nuevoTipo,
          cantidad: nuevaCantidad,
          monto: nuevoMonto,
          nota: cambios.nota !== undefined ? cambios.nota : ajuste.nota
        })

        // Revertir el monto anterior y acumular el nuevo si cambió de tipo o monto.
        if (ajuste.tipo !== nuevoTipo || Number(ajuste.monto) !== Number(nuevoMonto)) {
          await acumularAjusteEnCuadre(cuadreId, ajuste.tipo, -Number(ajuste.monto))
          await acumularAjusteEnCuadre(cuadreId, nuevoTipo, Number(nuevoMonto))
        }
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

  async function eliminarAjuste(ajusteId, cuadreId) {
    cargando.value = true
    try {
      if (esOnline.value) {
        await $api(`/api/ajustes/${ajusteId}`, {
          method: 'DELETE',
          headers: apiHeaders()
        })
      } else {
        const todos = await r(ajustesRepo).readAll()
        const ajuste = todos.find(a => a.id === ajusteId)
        if (!ajuste) throw new Error('Ajuste no encontrado')
        await acumularAjusteEnCuadre(cuadreId, ajuste.tipo, -Number(ajuste.monto))
        await r(ajustesRepo).remove(ajusteId)
      }
      await cargarActividadDelCuadre(cuadreId)
    } catch (err) {
      toast.add({ title: 'Error', description: err.data?.statusMessage || err.message, color: 'error' })
    } finally {
      cargando.value = false
    }
  }

  async function acumularAjusteEnCuadre(cuadreId, tipo, delta) {
    if (esOnline.value || !delta) return
    const cuadre = await r(cuadresRepo).read(cuadreId)
    if (!cuadre) return
    const campo = tipo === 'regalo' ? 'montoRegalo' : 'montoDescuento'
    const actual = Number(cuadre[campo] ?? 0)
    await r(cuadresRepo).update(cuadreId, {
      [campo]: Math.max(actual + delta, 0)
    })
  }

  function nombreProducto(productoId) {
    return productos.value.find(p => p.id === productoId)?.nombre || '—'
  }

  function nombreCliente(clienteId) {
    return clientes.value.find(c => c.id === clienteId)?.nombre || '—'
  }

  return {
    clientes, productos, ajustesDelCuadre, cargando,
    montoRegaloCalculado, montoDescuentoCalculado,
    cargarClientes, crearCliente, cargarProductos, cargarActividadDelCuadre,
    registrarAjuste, editarAjuste, eliminarAjuste,
    nombreProducto, nombreCliente
  }
}
