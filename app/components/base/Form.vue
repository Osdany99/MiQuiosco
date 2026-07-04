<template>
  <component
    :is="noForm ? 'div' : resolveComponent('UForm')"
    ref="formRef"
    v-bind="noForm ? {} : { schema: computedSchema, state: form }"
    class="space-y-4"
  >
    <div :class="hasColSpan ? 'grid grid-cols-1 sm:grid-cols-2 gap-4' : ''">
      <template v-for="field in fields" :key="field.name">
        <UFormField
          v-if="!field.hidden || !field.hidden(form)"
          :label="field.type === 'switch' ? '' : field.label"
          :name="field.name"
          :required="field.required"
          :class="field.colSpan || (hasColSpan ? 'sm:col-span-1' : '')"
        >
          <!-- Si hay slot custom para el field -->
          <template v-if="$slots[`field-${field.name}`]">
            <slot :name="`field-${field.name}`" :field="field" :form="form" />
          </template>

          <!-- Si es switch, renderizar con su label al lado (inline) -->
          <template v-else-if="field.type === 'switch'">
            <div class="flex items-center gap-3">
              <component
                :is="getFieldComponent('switch')"
                v-model="form[field.name]"
                v-bind="field.props"
              />
              <span class="text-sm font-medium text-gray-700 dark:text-gray-200">
                <span v-if="field.label">{{ field.label }} - </span>
                <span>{{ form[field.name] ? field.onLabel || 'Activo' : field.offLabel || 'Inactivo' }}</span>
              </span>
            </div>
          </template>

          <!-- Si es select, usar :items (Nuxt UI v3) -->
          <template v-else-if="field.type === 'select'">
            <component
              :is="getFieldComponent('select')"
              v-model="form[field.name]"
              v-bind="field.props"
              :items="field.items || field.props?.items"
              :value-key="field.valueKey || field.props?.valueKey || 'value'"
              :label-key="field.labelKey || field.props?.labelKey || 'label'"
              :class="field.class || 'w-full'"
            />
          </template>

          <!-- Componentes estándar (text, number, email, textarea) -->
          <template v-else>
            <component
              :is="getFieldComponent(field.type)"
              v-model="form[field.name]"
              v-bind="field.props"
              :placeholder="field.placeholder"
              :type="getInputType(field.type)"
              :class="field.class || 'w-full'"
            />
          </template>
        </UFormField>
      </template>
    </div>
  </component>
</template>

<script setup>
import { resolveComponent } from 'vue'
import { z } from 'zod'

const props = defineProps({
  fields: {
    type: Array,
    required: true
  },
  schema: {
    type: Object,
    default: null
  },
  modelValue: {
    type: Object,
    default: () => ({})
  },
  noForm: {
    type: Boolean,
    default: false
  }
})

const form = defineModel({ type: Object })
const formRef = ref()

const hasColSpan = computed(() =>
  props.fields.some(f => f.colSpan)
)

const getFieldComponent = (type) => {
  switch (type) {
    case 'textarea': return resolveComponent('UTextarea')
    case 'select': return resolveComponent('USelect')
    case 'switch': return resolveComponent('USwitch')
    case 'number':
    case 'email':
    case 'password':
    case 'text':
    default:
      return resolveComponent('UInput')
  }
}

const getInputType = (fieldType) => {
  const types = {
    email: 'email',
    number: 'number',
    password: 'password'
  }
  return types[fieldType]
}

const computedSchema = computed(() => {
  if (props.schema) return props.schema

  const shape = {}

  for (const field of props.fields) {
    if (field.hidden?.(form.value)) continue

    let validator

    switch (field.type) {
      case 'number':
        validator = field.required
          ? z.number({ message: field.errorMessage || `El ${field.label} es requerido` })
          : z.number().optional().nullable()
        break
      case 'switch':
        validator = z.boolean().default(true)
        break
      case 'select':
        validator = field.required
          ? z.string().min(1, field.errorMessage || `La selección es requerida`)
          : z.string().optional().nullable()
        break
      default:
        validator = field.required
          ? z.string().min(1, field.errorMessage || `El ${field.label} es requerido`)
          : z.string().optional().nullable()
    }

    shape[field.name] = validator
  }

  return z.object(shape)
})

defineExpose({
  validate: async () => {
    return await formRef.value?.validate()
  }
})
</script>
