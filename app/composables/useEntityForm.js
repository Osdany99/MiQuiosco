/**
 * useEntityForm(entity, form) — deriva los `fields` de BaseForm desde entity.fields.
 *
 * Cada field de la entity puede llevar un bloque `form` con overrides de UI:
 *   nombre: {
 *     type: 'string', required: true, max: 100, label: 'Nombre',
 *     form: {
 *       input: 'text',                 // fuerza el tipo de input (opcional)
 *       placeholder: 'Nombre...',
 *       colSpan: 'sm:col-span-2',
 *       props: { class: 'w-full' },
 *       items: [{ label, value }],     // sólo para select (si no, se derivan de values)
 *       hidden: (form) => boolean       // oculta el field condicionalmente
 *     }
 *   }
 *
 * - `form: false` excluye el field del formulario.
 * - El tipo de input se deriva del `type` zod (boolean→switch, enum→select,
 *   number/int→number, resto→text) salvo que `form.input` lo fuerce.
 * - Los switch reciben iconos por defecto; todos los inputs class 'w-full'.
 *
 * Consumido por EntityForm.vue. Reemplaza los Form.vue específicos por entidad.
 *
 * @param {Object} entity - entity de shared/entities
 * @param {Ref<Object>} form - el modelo reactivo del formulario (para hidden())
 * @returns {{ fields: import('vue').ComputedRef<Array> }}
 */

const SWITCH_DEFAULT_PROPS = {
  uncheckedIcon: 'i-lucide-x',
  checkedIcon: 'i-lucide-check',
  class: 'w-full'
}

function mapInputType(def) {
  if (def.form?.input) return def.form.input
  switch (def.type) {
    case 'boolean': return 'switch'
    case 'enum': return 'select'
    case 'number':
    case 'int': return 'number'
    default: return 'text'
  }
}

function capitalizar(v) {
  const s = String(v)
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function itemsDesdeValues(def) {
  if (def.form?.items) return def.form.items
  return (def.values || []).map(v => ({ label: capitalizar(v), value: v }))
}

function buildFormField(name, def) {
  const input = mapInputType(def)
  const fm = def.form || {}

  const props = input === 'switch'
    ? { ...SWITCH_DEFAULT_PROPS, ...(fm.props || {}) }
    : { class: 'w-full', ...(fm.props || {}) }

  const field = {
    name,
    label: fm.label || def.label || name,
    type: input,
    required: fm.required != null ? !!fm.required : !!def.required,
    placeholder: fm.placeholder,
    colSpan: fm.colSpan,
    props,
    hidden: fm.hidden
  }

  if (input === 'select') {
    field.items = itemsDesdeValues(def)
    field.valueKey = fm.valueKey || 'value'
    field.labelKey = fm.labelKey || 'label'
  }

  if (fm.maxlength != null) field.maxlength = fm.maxlength
  else if (def.max != null && (input === 'text')) field.maxlength = def.max

  return field
}

export function useEntityForm(entity, form) {
  if (!entity || !entity.fields) {
    throw new Error('useEntityForm: se requiere un objeto entity con .fields')
  }

  const fields = computed(() =>
    Object.entries(entity.fields)
      .filter(([, def]) => def.form !== false)
      .map(([name, def]) => buildFormField(name, def))
  )

  return { fields, form }
}
