<template>
  <div>
    <UBadge
      v-if="isTrue"
      :label="labelTrue"
      :color="colorTrue"
      size="sm"
    />
    <UBadge
      v-else
      :label="labelFalse"
      :color="colorFalse"
      size="sm"
    />
  </div>
</template>

<script setup>
const { colorTrue, colorFalse, labelTrue, labelFalse, value } = defineProps({
  colorTrue: { type: String, default: 'success' },
  colorFalse: { type: String, default: 'warning' },
  labelTrue: { type: String, default: 'Sí' },
  labelFalse: { type: String, default: 'No' },
  value: { type: [Boolean, String], default: false }
})

const isTrue = computed(() => {
  if (typeof value === 'boolean') return value
  return value === labelTrue
})
</script>
