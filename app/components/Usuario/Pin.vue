<script setup>
import { schemas } from '@/utils/validations'

const form = defineModel({
  type: Object,
  default: () => ({})
})

const formRef = ref()

const fields = [
  { name: 'pin', label: 'PIN', type: 'password', inputmode: 'numeric', maxlength: 6, placeholder: '••••', required: true, props: { class: 'w-full' } }
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
    :schema="schemas.pinReset"
  />
</template>
