<template>
  <UModal
    v-if="isOpen"
    v-model:open="isOpen"
    :prevent-close="loading"
    :dismissible="false"
    :title="title"
    :description="description"
    :close="{
      color: 'primary',
      variant: 'ghost',
      disabled: loading
    }"
  >
    <div class="py-4">
      <slot name="button" />
    </div>
    <template #body>
      <slot />
    </template>
    <template #footer>
      <BaseButtonActions
        :cancel-text="cancelText"
        :confirm-text="confirmText"
        :confirm-color="confirmColor"
        :loading="loading"
        :disabled-guardar="disabledGuardar"
        @cancel="$emit('cancel')"
        @confirm="$emit('confirm')"
      >
        <slot name="actions" />
      </BaseButtonActions>
    </template>
  </UModal>
</template>

<script setup>
const isOpen = defineModel({ type: Boolean, default: false })

defineProps({
  title: {
    type: String,
    default: 'Diálogo'
  },
  description: {
    type: String,
    default: ' '
  },
  cancelText: {
    type: String,
    default: 'Cancelar'
  },
  confirmText: {
    type: String,
    default: 'Confirmar'
  },
  confirmColor: {
    type: String,
    default: 'primary'
  },
  loading: {
    type: Boolean,
    default: false
  },
  disabledGuardar: {
    type: Boolean,
    default: false
  }
})

defineEmits(['confirm', 'cancel'])
</script>
