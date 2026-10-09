/**
 * useTableCrud - Composable para gestión de modales CRUD.
 *
 * @param {Object} props
 * @param {Object} [props.config] — { tabla, endpoints }
 */
export function useTableCrud(props, emit, form, refresh) {
  const toast = useToast()
  const label = props.config?.label
  const isOpen = ref(false)
  const isEditing = ref(false)
  const isDeleteOpen = ref(false)
  const itemToDelete = ref(null)

  const handleCloseModal = () => {
    isOpen.value = false
    isEditing.value = false
  }

  const handleEdit = (row) => {
    form.value = structuredClone(toRaw(row))
    isEditing.value = true
    isOpen.value = true
    emit('edit', row)
  }

  const handleDelete = (row) => {
    itemToDelete.value = row
    isDeleteOpen.value = true
  }

  function accionesRepo() {
    if (props.config) return useRepo(props.config)
    const stub = () => Promise.resolve({ data: null, error: null })
    stub.onSuccess = () => () => {}
    return {
      loading: ref(false),
      error: ref(null),
      onSuccess: () => () => {},
      create: stub,
      read: stub,
      readAll: stub,
      update: stub,
      patch: stub,
      remove: stub
    }
  }

  // --- API Delete (toast silenciado, ya hay modal de confirmación) ---
  const { remove, create, update, loading } = accionesRepo()
  const deleteLoading = loading

  const confirmDelete = async () => {
    if (itemToDelete.value) {
      const { error } = await remove(itemToDelete.value.id)
      if (error) return
      isDeleteOpen.value = false
      refresh()
    }
  }

  // --- API Create / Update (toast de error lo emite useRepo; no hay toast de éxito) ---

  const updateOrAdd = async (body) => {
    const { error } = isEditing.value
      ? await update(form.value.id, body)
      : await create(body)
    if (error) return error
    handleCloseModal()
    refresh()
    return null
  }
  // --- Submit ---
  const handleSubmit = async () => {
    if (props.formRef) {
      try {
        const formInstance = toValue(props.formRef)
        if (formInstance) {
          await formInstance.validate()
        }
      } catch {
        toast.add({ title: label ? `Corrige los errores en el formulario de ${label.singular}` : 'Corrige los errores en el formulario', color: 'warning' })
        return
      }
    }

    // El formulario se hidrata con la fila entera, así que al guardar volvería a
    // mandar `sincronizado` y `actualizadoEn` de cuando se leyó. Con esos dos
    // valores reenviados, la fila se guardaba "ya sincronizada" y con el
    // timestamp viejo: el push la filtraba y el siguiente pull le devolvía el
    // valor del servidor. Son de la sincronización, no de la edición.
    const CAMPOS_DE_SYNC = new Set(['id', 'creadoEn', 'actualizadoEn', 'sincronizado'])
    const body = Object.fromEntries(
      Object.entries(form.value).filter(([k]) => !CAMPOS_DE_SYNC.has(k))
    )
    await updateOrAdd(body)
  }

  return {
    isOpen,
    isEditing,
    isDeleteOpen,
    loading,
    deleteLoading,
    handleEdit,
    handleDelete,
    handleCloseModal,
    confirmDelete,
    handleSubmit
  }
}
