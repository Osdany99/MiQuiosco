import bcrypt from 'bcryptjs'

export function useUsuarioRepo() {
  const repo = useLocalRepo('usuarios')
  const auth = useAuth()

  async function create(datos) {
    const authUser = auth.usuarioActual.value
    const payload = {
      ...datos,
      pinHash: await bcrypt.hash(datos.pin, 10),
      puestoId: datos.puestoId ?? authUser?.puestoId
    }
    delete payload.pin
    return repo.create(payload)
  }

  async function update(id, cambios) {
    const payload = { ...cambios }
    if (payload.pin) {
      payload.pinHash = await bcrypt.hash(payload.pin, 10)
      delete payload.pin
    }
    return repo.update(id, payload)
  }

  return { ...repo, create, update, patch: update }
}
