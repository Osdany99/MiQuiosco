<script setup>
import { ENTIDADES } from '~/config/entidades'

const form = defineModel({
  type: Object,
  default: () => ({})
})

const itemsRol = [
  { label: 'Jefe', value: 'jefe' },
  { label: 'Trabajador', value: 'trabajador' }
]

const formRef = ref()

const esEdicion = computed(() => !!form.value?.id)
const rolActual = computed(() => form.value?.rol)

const isTrabajador = computed(() => rolActual.value === 'trabajador')

const fields = computed(() => {
  const f = [
    { name: 'nombre', label: 'Nombre', placeholder: 'Nombre completo', type: 'text', required: true, props: { class: 'w-full' } },
    { name: 'rol', label: 'Rol', type: 'select', props: { class: 'w-full' }, required: true, valueKey: 'value', labelKey: 'label', items: itemsRol }
  ]

  if (isTrabajador.value) {
    f.push({ name: 'salario', label: 'Salario base', placeholder: '600', type: 'number', props: { min: 0, class: 'w-full' } })
  }

  if (!esEdicion.value) {
    f.push({ name: 'pin', label: 'PIN', type: 'password', maxlength: 6, required: true, props: { mask: true } })
  }

  f.push({ name: 'activo', label: 'Activo', type: 'switch', props: {
    uncheckedIcon: 'i-lucide-x',
    checkedIcon: 'i-lucide-check',
    class: 'w-full'
  } })

  return f
})

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
    :schema="ENTIDADES.usuarios.schema"
  />
</template>
