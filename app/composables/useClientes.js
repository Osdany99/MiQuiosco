import { TABLES } from '../../shared/tables'

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

  async function cargarClientes(puestoId) {
    cargando.value = true
    try {
      const todos = await clientesRepo.value.readAll()
      clientes.value = (todos || []).filter(c => c.puestoId === puestoId && c.activo)
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
    // cliente creado pero sin número.
    const existente = filaConTelefono(telefono)
    if (existente) return reasignarTelefono(existente.id, clienteId, true)

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
  async function crearClienteConTelefono({ nombre, telefono }, puestoId) {
    const cliente = await crearCliente({ nombre }, puestoId)
    const tel = await agregarTelefono(cliente.id, telefono, puestoId)
    return { cliente, telefono: tel }
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
    telefonosDe,
    crearClienteConTelefono
  }
}
