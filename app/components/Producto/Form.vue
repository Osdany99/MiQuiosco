<script setup>
import { schemas } from '@/utils/validations'

const form = defineModel({
  type: Object,
  default: () => ({})
})

const formRef = ref()

const fields = [
  { name: 'nombre', label: 'Nombre', placeholder: 'Nombre del producto', type: 'text', required: true, props: { class: 'w-full' }, colSpan: 'sm:col-span-2' },
  { name: 'descripcion', label: 'Descripción', placeholder: 'Descripción opcional', type: 'text', props: { class: 'w-full' }, colSpan: 'sm:col-span-2' },
  { name: 'precioCompraActual', label: 'Precio compra', type: 'number', required: true, props: { min: 0, step: 100, class: 'w-full' } },
  { name: 'precioVentaActual', label: 'Precio venta', type: 'number', required: true, props: { min: 0, step: 100, class: 'w-full' } },
  { name: 'orden', label: 'Orden', type: 'number', props: { min: 1, step: 1, class: 'w-full' }, colSpan: 'sm:col-span-2' },
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
    :schema="schemas.product"
  />
</template>
