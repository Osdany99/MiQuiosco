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
      <div class="flex justify-end gap-3 w-full">
        <slot name="actions">
          <UButton
            color="primary"
            variant="outline"
            :disabled="loading"
            @click="$emit('cancel')"
          >
            {{ cancelText }}
          </UButton>
          <UButton
            :color="confirmColor"
            variant="solid"
            class="flex-1 sm:flex-none"
            :disabled="disabledGuardar"
            :loading="loading"
            @click="$emit('confirm')"
          >
            {{ confirmText }}
          </UButton>
        </slot>
      </div>
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
