/**
 * useEntityTable(entity) — deriva todo lo que una page CRUD necesita desde la entity.
 *
 * Centraliza el boilerplate repetido en cada page:
 * - `columns`   → entity.columns
 * - `form`      → ref con el estado inicial derivado de entity.fields (defaults)
 * - `submitFields` → keys de entity.fields (los campos que se envían al backend)
 * - `tableRef` / `formRef` → refs listos para BaseTable y BaseEntityForm
 * - `modalTitle` → entity.label
 *
 * Uso típico en una page:
 *   const { entity, columns, form, submitFields, tableRef, formRef, modalTitle } =
 *     useEntityTable(producto)
 *
 *   <BaseTable ref="tableRef" v-model="form" :entidad="entity" :columns="columns"
 *              :submit-fields="submitFields" :form-ref="formRef" :modal-title="modalTitle">
 *     <template #form>
 *       <BaseEntityForm ref="formRef" :entity="entity" v-model="form" />
 *     </template>
 *   </BaseTable>
 *
 * @param {Object} entity - entity de shared/entities
 * @returns {{ entity, columns, form, submitFields, tableRef, formRef, modalTitle, resetForm }}
 */

/**
 * Estado inicial de un field para el formulario, según su default o su tipo.
 */
function valorInicial(def) {
  if (def.default !== undefined) return def.default
  switch (def.type) {
    case 'boolean': return false
    case 'number':
    case 'int': return 0
    default: return ''
  }
}

function buildInitialForm(entity) {
  const base = { id: null }
  for (const [name, def] of Object.entries(entity.fields)) {
    base[name] = valorInicial(def)
  }
  return base
}

export function useEntityTable(entity) {
  if (!entity || !entity.fields) {
    throw new Error('useEntityTable: se requiere un objeto entity con .fields')
  }

  const tableRef = ref(null)
  const formRef = ref(null)

  const submitFields = Object.keys(entity.fields)
  const initial = buildInitialForm(entity)
  const form = ref({ ...initial })

  function resetForm() {
    form.value = { ...initial }
  }

  return {
    entity,
    columns: entity.columns,
    form,
    submitFields,
    tableRef,
    formRef,
    modalTitle: entity.label,
    resetForm
  }
}
