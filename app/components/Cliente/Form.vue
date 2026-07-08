<script setup>
const form = defineModel({
  type: Object,
  default: () => ({})
})

const formRef = ref()

const fields = [
  { name: 'nombre', label: 'Nombre', placeholder: 'Nombre del cliente', type: 'text', required: true, props: { class: 'w-full' }, colSpan: 'sm:col-span-2' },
  { name: 'telefono', label: 'Teléfono', placeholder: 'Teléfono opcional', type: 'text', props: { class: 'w-full' }, colSpan: 'sm:col-span-2' },
  { name: 'notas', label: 'Notas', placeholder: 'Notas opcionales', type: 'textarea', props: { class: 'w-full' }, colSpan: 'sm:col-span-2' },
  { name: 'activo', label: 'Activo', type: 'switch', props: { uncheckedIcon: 'i-lucide-x', checkedIcon: 'i-lucide-check', class: 'w-full' }, colSpan: 'sm:col-span-2' }
]

defineExpose({
  validate: async () => {
    return await formRef.value?.validate()
  }
})
</script>

<template>
  <BaseForm
    ref="formRef"
    v-model="form"
    :fields="fields"
    :schema="schemas.cliente"
  />
</template>
