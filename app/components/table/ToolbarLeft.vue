<template>
  <div>
    <div class="flex items-center gap-2">
      <UTooltip text="Restablecer todo" :delay-duration="0">
        <UButton
          icon="i-lucide-rotate-ccw"
          variant="ghost"
          color="neutral"
          size="sm"
          @click="limpiarYReload"
        />
      </UTooltip>
      <slot />
      <UButton
        v-if="showFilters && filterFields.length"
        variant="ghost"
        size="sm"
        icon="i-lucide-filter"
        :badge="activeCount || undefined"
        @click="openFilters = !openFilters"
      />
    </div>

    <div
      v-if="openFilters && filterFields.length"
      class="px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900"
    >
      <div class="flex flex-wrap gap-3">
        <div v-for="field in filterFields" :key="field.key" class="flex items-center gap-2">
          <label class="text-xs text-gray-500 whitespace-nowrap">{{ field.label }}</label>
          <USelectMenu
            v-if="field.type === 'select'"
            v-model="localFilters[field.key]"
            :items="field.options"
            value-attribute="value"
            text-attribute="label"
            class="w-40"
            clearable
          />
          <UInput
            v-else
            v-model="localFilters[field.key]"
            :placeholder="field.label"
            class="w-40"
            clearable
          />
        </div>
        <UButton
          v-if="activeCount"
          size="xs"
          variant="ghost"
          color="neutral"
          label="Limpiar"
          @click="limpiarFiltros"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  filterFields: { type: Array, default: () => [] },
  showFilters: { type: Boolean, default: false },
  modelValue: { type: Object, default: () => ({}) }
})

const emit = defineEmits(['update:modelValue', 'reload'])

const openFilters = ref(false)

const localFilters = reactive(
  Object.fromEntries(props.filterFields.map(f => [f.key, '']))
)

const activeCount = computed(() =>
  Object.values(localFilters).filter(v => v != null && v !== '').length
)

watch(localFilters, () => {
  const active = Object.fromEntries(
    Object.entries(localFilters).filter(([, v]) => v != null && v !== '')
  )
  emit('update:modelValue', active)
}, { deep: true })

function limpiarFiltros() {
  Object.keys(localFilters).forEach((k) => {
    localFilters[k] = ''
  })
}

function limpiarYReload() {
  limpiarFiltros()
  emit('reload')
}

defineExpose({ limpiarFiltros, openFilters })
</script>
