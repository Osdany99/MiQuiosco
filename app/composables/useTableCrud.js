/**
 * useTableCrud - Composable para gestión de modales CRUD (crear/editar/eliminar) en tablas.
 * Maneja estado de modales, validación de formularios y llamadas a API vía useCrud.
 *
 * @param {Object} props - Props del componente padre (BaseTable).
 * @param {string} props.apiUrl - URL base del endpoint API.
 * @param {number} [props.defaultLimit] - Límite por defecto de paginación.
 * @param {Object} [props.query={}] - Filtros adicionales para queries.
 * @param {boolean} [props.pagination=true] - Si usar paginación server-side.
 * @param {string} [props.dataKey] - Clave de datos en respuesta paginada.
 * @param {Ref} [props.formRef] - Referencia a componente de formulario (para validación).
 * @param {Function} emit - Función emit del componente padre.
 * @param {Ref} form - Modelo reactivo del formulario (defineModel / v-model).
 * @param {Function} refresh - Función refresh de useTableData para recargar tabla.
 *
 * @returns {Object} Estado de modales y handlers:
 * @returns {Ref<boolean>} returns.isOpen - True si modal crear/editar está abierto.
 * @returns {Ref<boolean>} returns.isEditing - True si está en modo edición (vs creación).
 * @returns {Ref<boolean>} returns.isDeleteOpen - True si modal confirmar eliminación está abierto.
 * @returns {Ref<boolean>} returns.loading - True durante create/update.
 * @returns {Ref<boolean>} returns.deleteLoading - True durante delete.
 * @returns {Function} returns.handleEdit - Abre modal en modo edición: (row) => void.
 * @returns {Function} returns.handleDelete - Abre modal confirmar eliminación: (row) => void.
 * @returns {Function} returns.handleCloseModal - Cierra modal create/edit.
 * @returns {Function} returns.confirmDelete - Ejecuta eliminación del item seleccionado.
 * @returns {Function} returns.handleSubmit - Valida y ejecuta create/update según modo.
 *
 * @example
 * const { isOpen, isEditing, isDeleteOpen, loading, deleteLoading, handleEdit, handleDelete, handleCloseModal, confirmDelete, handleSubmit } = useTableCrud(props, emit, form, refresh)
 *
 * // En template:
 * // <button @click="handleEdit(row)">Editar</button>
 * // <button @click="handleDelete(row)">Eliminar</button>
 * // <Modal v-model="isOpen">...</Modal>
 * // <ConfirmModal v-model="isDeleteOpen" @confirm="confirmDelete">...</ConfirmModal>
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
  const { remove, loading: deleteLoading } = useCrud(props.apiUrl, {
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

  const { create, update, loading } = useCrud(props.apiUrl, {
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
