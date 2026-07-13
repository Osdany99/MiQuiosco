<script setup>
import { cliente } from '~~/shared/entities'

definePageMeta({
  middleware: ['jefe']
})

const { entity, columns, form, submitFields, tableRef, formRef, modalTitle } = useEntityTable(cliente)
</script>

<template>
  <BaseHeaderPage
    title="Clientes"
    description="Gestiona los clientes para cuentas de fiado"
    title-button="Nuevo Cliente"
    @new="tableRef.openAdd()"
  >
    <BaseTable
      ref="tableRef"
      v-model="form"
      :entidad="entity"
      :columns="columns"
      empty-state="No se encontraron clientes"
      :modal-title="modalTitle"
      :form-ref="formRef"
      :submit-fields="submitFields"
    >
      <template #form>
        <BaseEntityForm ref="formRef" v-model="form" :entity="entity" />
      </template>
    </BaseTable>
  </BaseHeaderPage>
</template>
