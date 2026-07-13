<script setup>
/**
 * EntityForm.vue — formulario genérico derivado de una entity.
 *
 * Reemplaza a los Form.vue específicos (ProductoForm, ClienteForm, UsuarioForm).
 * Los `fields` se derivan de `entity.fields` vía useEntityForm(); el schema de
 * validación es `entity.schema`. Los campos condicionales (p.ej. PIN sólo al
 * crear, salario sólo para trabajador) se controlan con `form.hidden(form)` en
 * la metadata `form` de cada field de la entity.
 *
 * Uso:
 *   <BaseEntityForm ref="formRef" :entity="producto" v-model="form" />
 */
const { entity } = defineProps({
  entity: { type: Object, required: true }
})

const form = defineModel({
  type: Object,
  default: () => ({})
})

const formRef = ref()

const { fields } = useEntityForm(entity, form)

defineExpose({
  validate: async () => await formRef.value?.validate(),
  clear: () => formRef.value?.clear?.()
})
</script>

<template>
  <BaseForm
    ref="formRef"
    v-model="form"
    :fields="fields"
    :schema="entity.schema"
  >
    <template v-for="(_, name) in $slots" #[name]="slotProps">
      <slot :name="name" v-bind="slotProps" />
    </template>
  </BaseForm>
</template>
