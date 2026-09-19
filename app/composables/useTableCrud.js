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

    const body = Object.fromEntries(
      Object.entries(form.value).filter(([k]) => k !== 'id')
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
