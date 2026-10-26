import { TABLES } from '../../shared/tables'
import { $api } from '../utils/api'
import { clientesSimilares } from '#shared/clientes'
import {
  CLIENTE_SIN_CLIENTE_ID_FIJO,
  CLIENTE_SIN_CLIENTE_NOMBRE,
  CLIENTE_SIN_CLIENTE_NOTAS
} from '../../shared/constants'

const clienteConfig = TABLES.clientes
const telefonoConfig = TABLES.clientes_telefonos

/**
 * useClientes - Lista única de clientes del negocio.
 *
 * Antes los clientes eran `usuarios.rol='cliente'`. Ahora son su propia tabla
 * porque el tope de 360 CUP es POR NÚMERO y un cliente puede tener varios:
 * `usuarios.telefono` (único) no daba para eso.
 *
 * El número canónico de 10 dígitos es la clave con la que se empareja cada
 * recarga que entra por SMS, por eso el emparejamiento vive aquí y no en la
 * vista.
 */
export function useClientes() {
  const conexion = useModoConexion()
  const esOnline = computed(() => conexion.modo.value === 'online')

  const clientesRepo = computed(() => (esOnline.value ? useRemoteRepo(clienteConfig) : useLocalRepo(clienteConfig)))
  const telefonosRepo = computed(() => (esOnline.value ? useRemoteRepo(telefonoConfig) : useLocalRepo(telefonoConfig)))

  const clientes = ref([])
  const telefonos = ref([])
  const cargando = ref(false)

  function apiHeaders() {
    const token = useAuth().jwtSync.value
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  /**
   * Clientes del puesto. Por defecto SIN el centinela: fiarle o venderle a
   * "Sin cliente" no tiene sentido, solo se ofrece donde sí lo es (las
   * transferencias). Pídelo con `incluirSinCliente` en ese selector.
   *
   * `incluirInactivos` es para vistas de solo lectura que deben poner nombre a
   * datos históricos (deudas, recargas): desactivar un cliente no debe dejar
   * sus deudas huérfanas con el nombre genérico "Cliente".
   *
   * El centinela se asegura en cada carga, no en la siembra: sembrarJefeLocal
   * hace early-return en una base que ya tiene usuarios, así que un dispositivo
   * en uso nunca lo crearía. Además se autorrepara si alguien lo desactivó.
   */
  async function cargarClientes(puestoId, { incluirSinCliente = false, incluirInactivos = false } = {}) {
    cargando.value = true
    try {
      const filas = [...((await clientesRepo.value.readAll()) || [])]

      if (!filas.some(c => c.id === CLIENTE_SIN_CLIENTE_ID_FIJO && c.puestoId === puestoId)) {
        filas.push(await clientesRepo.value.create({
          id: CLIENTE_SIN_CLIENTE_ID_FIJO,
          puestoId,
          nombre: CLIENTE_SIN_CLIENTE_NOMBRE,
          notas: CLIENTE_SIN_CLIENTE_NOTAS,
          activo: true
        }))
      }

      clientes.value = filas.filter(c =>
        c.puestoId === puestoId
        && (incluirInactivos || c.activo)
        && !c.fusionadoEn
        && (incluirSinCliente || c.id !== CLIENTE_SIN_CLIENTE_ID_FIJO)
      )
      return clientes.value
    } finally {
      cargando.value = false
    }
  }

  async function cargarTelefonos() {
    telefonos.value = (await telefonosRepo.value.readAll()) || []
    return telefonos.value
  }

  async function crearCliente(data, puestoId) {
    const nuevo = await clientesRepo.value.create({ ...data, puestoId, activo: true })
    clientes.value.push(nuevo)
    return nuevo
  }

  /** Cliente activo que tiene ese número canónico, o null si no hay ninguno. */
  function buscarPorTelefono(telefono) {
    if (!telefono) return null
    return telefonos.value.find(t => t.activo !== false && t.telefono === telefono) ?? null
  }

  /**
   * Cualquier fila con ese número, INACTIVA incluida.
   *
   * Hace falta porque `telefono` es UNIQUE: desvincular un número lo deja
   * inactivo, no borrado (lo referencia el historial de recargas). Si al
   * reasignarlo se insertara una fila nueva, el UNIQUE reventaría y el cliente
   * se crearía sin número.
   */
  function filaConTelefono(telefono) {
    if (!telefono) return null
    return telefonos.value.find(t => t.telefono === telefono) ?? null
  }

  function telefonosDe(clienteId) {
    return telefonos.value.filter(t => t.clienteId === clienteId && t.activo !== false)
  }

  async function agregarTelefono(clienteId, telefono, puestoId, etiqueta = null) {
    // Reutiliza la fila que ya hubiera con ese número, aunque estuviera
    // inactiva: `telefono` es UNIQUE y insertar otra vez reventaría, dejando el
    // cliente creado pero sin número. Si la fila no tenía nombre propio, se le
    // pone el del contacto de origen (importación); si ya tenía, se respeta:
    // el alias pertenece al número, no al último import que lo tocó.
    const existente = filaConTelefono(telefono)
    if (existente) {
      const sinEtiqueta = !String(existente.etiqueta ?? '').trim()
      return moverTelefono(
        existente.id,
        clienteId,
        etiqueta && sinEtiqueta ? { etiqueta } : {}
      )
    }

    const nuevo = await telefonosRepo.value.create({
      puestoId,
      clienteId,
      telefono,
      telefonoRaw: telefono,
      etiqueta,
      activo: true
    })
    telefonos.value.push(nuevo)
    return nuevo
  }

  /**
   * Mueve un número a otro cliente. Como `telefono` es único en toda la tabla no
   * se puede crear una fila nueva: se mueve la existente.
   * @param {boolean} activar reactiva la fila si estaba desvinculada.
   */
  async function reasignarTelefono(telefonoId, clienteId, activar = false) {
    const act = await telefonosRepo.value.patch(
      telefonoId,
      activar ? { clienteId, activo: true } : { clienteId }
    )
    const i = telefonos.value.findIndex(t => t.id === telefonoId)
    if (i >= 0) telefonos.value[i] = { ...telefonos.value[i], ...act }
    return act
  }

  /**
   * Deja un número con el cliente indicado, creándolo si hacía falta.
   */
  async function asignarTelefonoA(telefono, clienteId, puestoId) {
    const existente = buscarPorTelefono(telefono)
    if (existente) {
      if (existente.clienteId === clienteId) return existente
      return reasignarTelefono(existente.id, clienteId)
    }
    return agregarTelefono(clienteId, telefono, puestoId)
  }

  /**
   * Desvincula un número: queda inactivo, no se borra (el historial de recargas
   * lo referencia).
   *
   * Actualiza la lista en memoria a propósito: `ocupados` se deriva de ella y la
   * usa el importador de contactos. Sin esto, un número recién desvinulado
   * seguiría saliendo como ocupado hasta recargar la página.
   */
  async function desvincularTelefono(telefonoId) {
    const act = await telefonosRepo.value.patch(telefonoId, { activo: false })
    const i = telefonos.value.findIndex(t => t.id === telefonoId)
    if (i >= 0) telefonos.value[i] = { ...telefonos.value[i], ...act, activo: false }
    return act
  }

  /**
   * Cliente y número en un solo paso. Es el flujo de mostrador: se teclea el
   * nombre y la siguiente recarga a ese número entra ya asignada.
   */
  async function crearClienteConTelefono({ nombre, telefono, etiqueta = null }, puestoId) {
    const cliente = await crearCliente({ nombre }, puestoId)
    const tel = await agregarTelefono(cliente.id, telefono, puestoId, etiqueta)
    return { cliente, telefono: tel }
  }

  /** Cualquier fila con ese número, activa o no. Sirve para leer su etiqueta. */
  function telefonoDe(telefono) {
    if (!telefono) return null
    return telefonos.value.find(t => t.telefono === telefono) ?? null
  }

  /**
   * Clientes con nombre parecido. Solo alimenta avisos de la UI: decidir si dos
   * nombres son la misma persona es siempre del jefe.
   */
  function clientesParecidos(nombre, { excluirId = null, umbral = 0.8 } = {}) {
    return clientesSimilares(nombre, clientes.value, { excluirId, umbral })
  }

  /**
   * Reasigna un número a otro cliente, reactivándolo si estaba desvinculado.
   * Quien llama debe confirmar antes: mover un número cambia a quién se le
   * imputan las próximas recargas (el historial ya guardado no se mueve).
   */
  async function moverTelefono(telefonoId, clienteId, { etiqueta } = {}) {
    const cambios = { clienteId, activo: true }
    if (etiqueta !== undefined) cambios.etiqueta = etiqueta
    const fila = await telefonosRepo.value.patch(telefonoId, cambios)
    const i = telefonos.value.findIndex(t => t.id === telefonoId)
    const actualizada = { ...telefonos.value[i], ...cambios, ...(fila ?? {}) }
    if (i >= 0) telefonos.value[i] = actualizada
    return actualizada
  }

  /**
   * Fusiona dos o más clientes en una identidad única.
   *
   * Offline lo resuelve la acción `fusionar` del módulo local (transacción); en
   * modo online, el endpoint equivalente. En ambos casos el absorbido queda
   * inactivo y sus números conservan su nombre en `etiqueta`.
   * @returns {Promise<object>} cliente principal + `resumen`
   */
  async function fusionarClientes({ ids, nombreFinal }) {
    const res = esOnline.value
      ? await $api('/api/clientes/fusionar', {
          method: 'POST',
          body: { ids, nombreFinal },
          headers: apiHeaders()
        })
      : await clientesRepo.value.fusionar({ ids, nombreFinal })

    await cargarTelefonos()
    const puestoId = useAuth().usuarioActual.value?.puestoId ?? null
    if (puestoId) await cargarClientes(puestoId)
    return res
  }

  return {
    clientesRepo,
    telefonosRepo,
    clientes,
    telefonos,
    cargando,
    cargarClientes,
    cargarTelefonos,
    crearCliente,
    agregarTelefono,
    reasignarTelefono,
    asignarTelefonoA,
    desvincularTelefono,
    buscarPorTelefono,
    telefonoDe,
    clientesParecidos,
    moverTelefono,
    fusionarClientes,
    telefonosDe,
    crearClienteConTelefono
  }
}
