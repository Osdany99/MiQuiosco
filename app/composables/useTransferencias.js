import { TABLES } from '../../shared/tables'
import { $api } from '../utils/api'

const transferenciaConfig = TABLES.transferencias
const transferenciaItemConfig = TABLES.transferencia_items
const cuadreConfig = TABLES.cuadres

export function useTransferencias() {
  const toast = useToast()
  const conexion = useModoConexion()
  const esOnline = computed(() => conexion.modo.value === 'online')
  const auth = useAuth()

  function apiHeaders() {
    const token = auth.jwtSync.value
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  const transferenciasRepo = computed(() => esOnline.value ? useRemoteRepo(transferenciaConfig) : useLocalRepo(transferenciaConfig))
  const itemsRepo = computed(() => esOnline.value ? useRemoteRepo(transferenciaItemConfig) : useLocalRepo(transferenciaItemConfig))
  const cuadresRepo = computed(() => esOnline.value ? useRemoteRepo(cuadreConfig) : useLocalRepo(cuadreConfig))

  function r(repo) {
    return repo.value
  }

  const { clientes, cargarClientes, crearCliente } = useClientes()
  const transferenciasDelCuadre = ref([])
  const cargando = ref(false)

  const montoTransferenciaCalculado = computed(() =>
    transferenciasDelCuadre.value.reduce((sum, t) => sum + Number(t.montoTotal || 0), 0)
  )

  async function cargarActividadDelCuadre(cuadreId) {
    const rpta = await r(transferenciasRepo).readAll({ query: { cuadreId } })
    // useRemoteRepo devuelve el array directo y useLocalRepo { data }: se
    // aceptan ambas formas (antes solo { data } y en online la lista salía
    // vacía aunque el monto sí subía).
    const todas = Array.isArray(rpta) ? rpta : (rpta?.data ?? [])
    transferenciasDelCuadre.value = todas.filter(t => t.cuadreId === cuadreId)
  }

  // Monto directo, sin productos ni tope: "el cliente X transfirió N pesos".
  async function registrarTransferencia({ clienteId, cuadreId, monto, puestoId }) {
    cargando.value = true
    try {
      const montoTotal = Math.round((Number(monto) || 0) * 100) / 100
      if (!clienteId) throw new Error('Elige el cliente que transfirió.')
      if (!(montoTotal > 0)) throw new Error('El monto debe ser mayor que cero.')
      if (esOnline.value) {
        await $api('/api/transferencias', {
          method: 'POST',
          body: { clienteId, cuadreId, monto: montoTotal },
          headers: apiHeaders()
        })
      } else {
        const nueva = await r(transferenciasRepo).create({
          clienteId,
          cuadreId,
          puestoId,
          montoTotal
        })
        void nueva
        await acumularTransferenciaEnCuadre(cuadreId, montoTotal)
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

  async function editarTransferencia({ transferenciaId, monto, cuadreId }) {
    cargando.value = true
    try {
      const nuevoTotal = Math.round((Number(monto) || 0) * 100) / 100
      if (!(nuevoTotal > 0)) throw new Error('El monto debe ser mayor que cero.')
      if (esOnline.value) {
        await $api(`/api/transferencias/${transferenciaId}`, {
          method: 'PATCH',
          body: { monto: nuevoTotal },
          headers: apiHeaders()
        })
      } else {
        const todas = await r(transferenciasRepo).readAll()
        const transferencia = todas.find(t => t.id === transferenciaId)
        if (!transferencia) throw new Error('Transferencia no encontrada')

        // Las líneas históricas por producto (modelo anterior) se retiran.
        const existentes = await r(itemsRepo).readAll()
        const itemsActuales = existentes.filter(i => i.transferenciaId === transferenciaId)
        for (const antiguo of itemsActuales) {
          await r(itemsRepo).remove(antiguo.id)
        }

        await r(transferenciasRepo).update(transferenciaId, { montoTotal: nuevoTotal })

        const delta = nuevoTotal - Number(transferencia.montoTotal)
        if (delta !== 0) await acumularTransferenciaEnCuadre(cuadreId, delta)
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
