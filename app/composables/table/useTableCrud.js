import { useApi } from '~/composables/crud/useApi'

/**
 * useTableCrud
 * Gestiona los modales de creación/edición/eliminación y las llamadas a la API.
 *
 * @param {Object} props   - Props del componente BaseTable
 * @param {Object} emit    - Función emit del componente
 * @param {Ref}    form    - defineModel del componente (v-model)
 * @param {Function} refresh - Función refresh de useTableData
 */
export function useTableCrud(props, emit, form, refresh) {
  // ─── Estado de modales ────────────────────────────────────────
  const isOpen = ref(false)
  const isEditing = ref(false)
  const isDeleteOpen = ref(false)
  const itemToDelete = ref(null)

  const handleCloseModal = () => {
    isOpen.value = false
    isEditing.value = false
  }

  // ─── Handlers de tabla ────────────────────────────────────────
  const handleEdit = (row) => {
    // Usamos JSON en lugar de structuredClone para evitar el error DOMException
    // ocasionado por los objetos Proxy nativos de Vue o TanStack.
    form.value = JSON.parse(JSON.stringify(row))
    isEditing.value = true
    isOpen.value = true
    emit('edit', row)
  }

  const handleDelete = (row) => {
    itemToDelete.value = row
    isDeleteOpen.value = true
  }

  // ─── API Delete ───────────────────────────────────────────────
  const { remove, loading: deleteLoading } = useApi(props.apiUrl, {
    onSuccess: () => {
      isDeleteOpen.value = false
      refresh()
      emit('success', 'Eliminado correctamente')
    }
  })

  const confirmDelete = async () => {
    if (itemToDelete.value) {
      await remove(itemToDelete.value.id)
    }
  }

  // ─── API Create / Update ──────────────────────────────────────
  const successMessage = ref('Operación exitosa')

  const { create, update, loading } = useApi(props.apiUrl, {
    onSuccess: () => {
      handleCloseModal()
      emit('reset')
      refresh()
      emit('success', successMessage.value)
    }
  })

  // ─── Submit ───────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (props.formRef) {
      try {
        await props.formRef.validate()
      } catch (_error) {
        console.warn('[BaseTable] Validación fallida:', _error)
        return
      }
    }

    successMessage.value = isEditing.value
      ? 'Actualizado correctamente'
      : 'Creado correctamente'

    const { id, ...body } = form.value
    const { error } = isEditing.value
      ? await update(id, body)
      : await create(body)

    if (!error) {
      handleCloseModal()
      emit('reset')
    }
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
