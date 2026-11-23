import { TABLES } from '../../shared/tables'
import { $api } from '../utils/api'
import { generarId } from '../../shared/inventario/operaciones'
import { conflictoIdempotente, transferenciaCoincide } from '../../shared/fiadoIdempotencia'
import { useDb } from '../server-offline/db/client'

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

  const db = useDb()

  async function transferenciaPorId(id) {
    if (!id) return null
    if (!esOnline.value) return await r(transferenciasRepo).read(id) ?? null
    const filas = await r(transferenciasRepo).readAll()
    return (filas ?? []).find(fila => fila?.id === id) ?? null
  }

  const { clientes, cargarClientes, crearCliente } = useClientes()
  const transferenciasDelCuadre = ref([])
  const cargando = ref(false)

  async function cargarActividadDelCuadre(cuadreId) {
    const rpta = await r(transferenciasRepo).readAll({ query: { cuadreId } })
    // useRemoteRepo devuelve el array directo y useLocalRepo { data }: se
    // aceptan ambas formas (antes solo { data } y en online la lista salía
    // vacía aunque el monto sí subía).
    const todas = Array.isArray(rpta) ? rpta : (rpta?.data ?? [])
    transferenciasDelCuadre.value = todas.filter(t => t.cuadreId === cuadreId)
  }

  // Monto directo, sin productos ni tope: "el cliente X transfirió N pesos".
  async function registrarTransferencia({ id = null, clienteId, cuadreId, monto, puestoId }) {
    cargando.value = true
    try {
      const montoTotal = Math.round((Number(monto) || 0) * 100) / 100
      if (!clienteId) throw new Error('Elige el cliente que transfirió.')
      if (!(montoTotal > 0)) throw new Error('El monto debe ser mayor que cero.')
      // Id fijado por quien abre el formulario: reintentar no suma dos veces.
      const transferenciaId = String(id || '').trim() || generarId()
      const esperado = { clienteId, cuadreId, montoTotal }
      let idempotente = false
      if (esOnline.value) {
        const rpta = await $api('/api/transferencias', {
          method: 'POST',
          body: { id: transferenciaId, ...esperado, monto: montoTotal },
          headers: apiHeaders()
        })
        idempotente = rpta?.idempotente === true
      } else {
        const previa = await transferenciaPorId(transferenciaId)
        if (previa) {
          if (!transferenciaCoincide(previa, esperado)) throw conflictoIdempotente('transferencia')
          idempotente = true
        }
        if (!idempotente) {
          // Encontrar la fila al reconciliar implica que el cuadre también quedó
          // actualizado; nunca se confirma una transferencia a medias.
          await db.transaction(async () => {
            await r(transferenciasRepo).create({
              id: transferenciaId,
              clienteId,
              cuadreId,
              puestoId,
              montoTotal
            })
            await acumularTransferenciaEnCuadre(cuadreId, montoTotal)
          })
        }
      }
      await cargarActividadDelCuadre(cuadreId).catch(() => {})
      return { ok: true, id: transferenciaId, idempotente }
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
    cargarClientes, crearCliente, cargarActividadDelCuadre,
    registrarTransferencia, eliminarTransferencia, transferenciaPorId,
    itemsDeTransferencia
  }
}
