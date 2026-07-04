<script setup>
import { schemas } from '@/utils/validations'

const form = defineModel({
  type: Object,
  default: () => ({})
})

const itemsRol = [
  { label: 'Admin', value: 'admin' },
  { label: 'Jefe', value: 'jefe' },
  { label: 'Trabajador', value: 'trabajador' }
]

const formRef = ref()
const fields = [
  { name: 'name', label: 'Nombre', placeholder: 'Nombre completo', type: 'text', required: true, props: { class: 'w-full' } },
  { name: 'rol', label: 'Rol', type: 'select', props: { class: 'w-full' }, valueKey: 'value', labelKey: 'label', items: itemsRol },
  { name: 'pin', label: 'PIN', type: 'password', inputmode: 'numeric', maxlength: 6, placeholder: '••••', required: true, props: { class: 'w-full' } },
  { name: 'activo', label: 'Activo', type: 'checkbox', props: { class: 'w-full' } }
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
    :schema="schemas.user"
  />
</template>
