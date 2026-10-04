<template>
  <div class="flex items-center gap-2">
    <UTooltip text="Restablecer" :delay-duration="0">
      <UButton
        icon="i-lucide-rotate-ccw"
        variant="ghost"
        size="sm"
        @click="limpiarYReload"
      />
    </UTooltip>
    <slot />
    <UPopover v-if="resolvedFilterFields.length" v-model:open="open">
      <UTooltip text="Filtrar" :delay-duration="0">
        <UButton
          variant="ghost"
          size="sm"
          icon="i-lucide-filter"
          :badge="appliedCount || undefined"
        />
      </UTooltip>
      <template #content>
        <div class="p-4 min-w-48 space-y-3">
          <div v-for="field in resolvedFilterFields" :key="field.key" class="flex items-center gap-2">
            <label class="text-xs text-gray-500 whitespace-nowrap min-w-16">{{ field.label }}</label>
            <USelectMenu
              v-if="field.type === 'select'"
              v-model="draft[field.key]"
              :items="field.options"
              value-key="value"
              label-key="label"
              class="w-40"
              clearable
              :search-input="false"
            />
            <UInput
              v-else
              v-model="draft[field.key]"
              :placeholder="field.label"
              class="w-40"
              clearable
            />
          </div>
          <div class="flex justify-between items-center pt-2 border-t border-gray-200 dark:border-gray-800">
            <UButton
              size="xs"
              variant="ghost"
              color="neutral"
              label="Limpiar"
              @click="aplicarLimpiar"
            />
            <div class="flex gap-2">
              <UButton
                size="xs"
                variant="ghost"
                color="neutral"
                label="Cancelar"
                @click="cancelar"
              />
              <UButton
                size="xs"
                color="primary"
                label="Aplicar"
                @click="aplicar"
              />
            </div>
          </div>
        </div>
      </template>
    </UPopover>
  </div>
</template>

<script setup>
const props = defineProps({
  filterFields: { type: Array, default: () => [] },
  columns: { type: Array, default: () => [] },
  disableFilters: { type: Boolean, default: false },
  modelValue: { type: Object, default: () => ({}) }
})

const emit = defineEmits(['update:modelValue', 'reload'])

const resolvedFilterFields = computed(() => {
  if (props.disableFilters) return []
  if (props.filterFields?.length) return props.filterFields
  return props.columns
    .filter(c => c.accessorKey && c.accessorKey !== 'id' && c.accessorKey !== 'action' && c.visible !== false && c.filterable !== false)
    .map(c => ({
      key: c.accessorKey,
      label: c.header,
      type: (c.cell === 'activation' || c.cell === 'boolean') ? 'select' : 'text',
      options: (c.cell === 'activation' || c.cell === 'boolean')
        ? [{ label: 'Sí', value: 'true' }, { label: 'No', value: 'false' }]
        : undefined
    }))
})

const open = ref(false)

const draft = reactive({})

watch(() => resolvedFilterFields.value, (fields) => {
  for (const f of fields) {
    if (!(f.key in draft)) draft[f.key] = ''
  }
}, { immediate: true })

watch(open, (isOpen) => {
  if (isOpen) {
    for (const key of Object.keys(draft)) {
      draft[key] = (props.modelValue[key] != null && props.modelValue[key] !== '')
        ? props.modelValue[key]
        : ''
    }
  }
})

const appliedCount = computed(() =>
  Object.values(props.modelValue).filter(v => v != null && v !== '').length
)

function aplicar() {
  const active = Object.fromEntries(
    Object.entries(draft).filter(([, v]) => v != null && v !== '')
  )
  emit('update:modelValue', active)
  open.value = false
}

function cancelar() {
  for (const key of Object.keys(draft)) {
    draft[key] = (props.modelValue[key] != null && props.modelValue[key] !== '')
      ? props.modelValue[key]
      : ''
  }
  open.value = false
}

function aplicarLimpiar() {
  Object.keys(draft).forEach(k => (draft[k] = ''))
  emit('update:modelValue', {})
  open.value = false
}

function limpiarYReload() {
  Object.keys(draft).forEach(k => (draft[k] = ''))
  emit('update:modelValue', {})
  emit('reload')
}
</script>
