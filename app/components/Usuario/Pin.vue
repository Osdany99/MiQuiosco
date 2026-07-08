<script setup>
const form = defineModel({
  type: Object,
  default: () => ({})
})

const formRef = ref()

const fields = [
  { name: 'pin', label: 'PIN', type: 'pin', maxlength: 6, required: true, props: { mask: true } }
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
