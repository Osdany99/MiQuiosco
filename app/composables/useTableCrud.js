import { toastMsg } from '~/utils/toast'

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
    form.value = structuredClone(row)
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
      await remove(itemToDelete.value.id)
      isDeleteOpen.value = false
      refresh()
      emit('success', 'Eliminado correctamente')
    }
  }

  // --- API Create / Update (toast silenciado, el componente padre emite su propio success) ---
  const successMessage = ref('Operación exitosa')

  const updateOrAdd = async (body) => {
    if (isEditing.value) {
      const { error } = await update(form.value.id, body)
      handleCloseModal()
      refresh()
      emit('success', successMessage.value)
      return error
    } else {
      const { error } = await create(body)
      handleCloseModal()
      refresh()
      emit('success', successMessage.value)
      return error
    }
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

    successMessage.value = isEditing.value
      ? (label ? toastMsg('updated', label) : 'Actualizado correctamente')
      : (label ? toastMsg('created', label) : 'Creado correctamente')

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
