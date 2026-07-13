/**
 * useTableCrud - Composable para gestión de modales CRUD (crear/editar/eliminar) en tablas.
 * Maneja estado de modales, validación de formularios y llamadas a API vía useRepoAction.
 *
 * @param {Object} props - Props del componente padre (BaseTable).
 * @param {Object} [props.entidad] - Entity de shared/entities (preferido).
 * @param {number} [props.defaultLimit] - Límite por defecto de paginación.
 * @param {Object} [props.query={}] - Filtros adicionales para queries.
 * @param {boolean} [props.pagination=true] - Si usar paginación server-side.
 * @param {string} [props.dataKey] - Clave de datos en respuesta paginada.
 * @param {Ref} [props.formRef] - Referencia a componente de formulario (para validación).
 * @param {Function} emit - Función emit del componente padre.
 * @param {Ref} form - Modelo reactivo del formulario (defineModel / v-model).
 * @param {Function} refresh - Función refresh de useTableData para recargar tabla.
 */
export function useTableCrud(props, emit, form, refresh) {
  // --- Estado de modales ---
  const isOpen = ref(false)
  const isEditing = ref(false)
  const isDeleteOpen = ref(false)
  const itemToDelete = ref(null)

  const handleCloseModal = () => {
    isOpen.value = false
    isEditing.value = false
  }

  // --- Handlers de tabla ---
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

  /**
   * Acciones de repo. Sólo se crean si la tabla está ligada a una entity
   * (props.entidad). Las tablas de datos externos (p.ej. CuadreLineaTable, que
   * pasa :data y desactiva edición/borrado) no tienen entity: en ese caso se
   * devuelven stubs no-op para no llamar a useRepo(null), que lanzaría.
   */
  function accionesRepo() {
    if (props.entidad) return useRepoAction(props.entidad, { toast: false })
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
  const { remove, loading: deleteLoading } = accionesRepo()
  remove.onSuccess(() => {
    isDeleteOpen.value = false
    refresh()
    emit('success', 'Eliminado correctamente')
  })

  const confirmDelete = async () => {
    if (itemToDelete.value) {
      await remove(itemToDelete.value.id)
    }
  }

  // --- API Create / Update (toast silenciado, el componente padre emite su propio success) ---
  const successMessage = ref('Operación exitosa')

  const { create, update, loading } = accionesRepo()
  create.onSuccess(() => {
    handleCloseModal()
    refresh()
    emit('success', successMessage.value)
  })
  update.onSuccess(() => {
    handleCloseModal()
    refresh()
    emit('success', successMessage.value)
  })

  // --- Submit ---
  const handleSubmit = async () => {
    if (props.formRef) {
      try {
        const formInstance = toValue(props.formRef)
        if (formInstance) {
          await formInstance.validate()
        }
      } catch {
        return
      }
    }

    successMessage.value = isEditing.value
      ? 'Actualizado correctamente'
      : 'Creado correctamente'

    const body = Object.fromEntries(
      Object.entries(form.value).filter(([k]) => k !== 'id' && (!props.submitFields || props.submitFields.includes(k)))
    )
    const { error } = isEditing.value
      ? await update(form.value.id, body)
      : await create(body)

    if (!error) {
      handleCloseModal()
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
