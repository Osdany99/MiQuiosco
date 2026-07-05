<template>
  <component
    :is="noForm ? 'div' : UForm"
    ref="formRef"
    v-bind="noForm ? {} : { schema: computedSchema, state: form }"
    class="space-y-4"
  >
    <div :class="hasColSpan ? 'grid grid-cols-1 sm:grid-cols-2 gap-4' : 'space-y-2'">
      <template v-for="field in fields" :key="field.name">
        <UFormField
          v-if="!field.hidden || !field.hidden(form)"
          :label="field.type === 'switch' ? '' : field.label"
          :name="field.name"
          :required="field.required"
          :class="field.colSpan || (hasColSpan ? 'sm:col-span-1' : '')"
        >
          <template v-if="$slots[`field-${field.name}`]">
            <slot :name="`field-${field.name}`" :field="field" :form="form" />
          </template>

          <template v-else-if="field.type === 'switch'">
            <div class="flex items-center gap-3">
              <USwitch v-model="form[field.name]" v-bind="field.props" :label="field.label" />
            </div>
          </template>

          <template v-else-if="field.type === 'select'">
            <USelectMenu
              v-model="form[field.name]"
              v-bind="field.props"
              :items="field.items || field.props?.items"
              :value-key="field.valueKey || field.props?.valueKey || 'value'"
              :label-key="field.labelKey || field.props?.labelKey || 'label'"
              :class="field.class || 'w-full'"
            />
          </template>

          <template v-else-if="field.type === 'textarea'">
            <UTextarea
              v-model="form[field.name]"
              v-bind="field.props"
              :placeholder="field.placeholder"
              :class="field.class || 'w-full'"
            />
          </template>

          <template v-else>
            <UInput
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

const UForm = resolveComponent('UForm')

const { fields, schema, noForm } = defineProps({
  fields: { type: Array, required: true },
  schema: { type: Object, default: null },
  noForm: { type: Boolean, default: false }
})

const form = defineModel({ type: Object })
const formRef = ref()

const hasColSpan = computed(() => fields.some(f => f.colSpan))
const computedSchema = computed(() => schema)

const getInputType = (fieldType) => {
  const types = { email: 'email', number: 'number', password: 'password' }
  return types[fieldType]
}

defineExpose({
  validate: async () => await formRef.value?.validate(),
  clear: () => formRef.value?.clear?.()
})
</script>
