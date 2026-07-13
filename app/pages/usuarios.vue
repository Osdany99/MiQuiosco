<script setup>
import { usuario } from '~~/shared/entities'

definePageMeta({
  middleware: ['jefe']
})

const { entity, columns, form, submitFields, tableRef, formRef, modalTitle } = useEntityTable(usuario)
</script>

<template>
  <BaseHeaderPage
    title="Usuarios"
    description="Gestiona los usuarios del puesto"
    title-button="Nuevo Usuario"
    @new="tableRef.openAdd()"
  >
    <BaseTable
      ref="tableRef"
      v-model="form"
      :entidad="entity"
      :columns="columns"
      empty-state="No se encontraron usuarios"
      :modal-title="modalTitle"
      :form-ref="formRef"
      :submit-fields="submitFields"
    >
      <template #form>
        <BaseEntityForm ref="formRef" :entity="entity" v-model="form" />
      </template>
    </BaseTable>
  </BaseHeaderPage>
</template>
