<template>
  <div class="flex justify-end gap-3 w-full">
    <slot />
    <UButton
      color="primary"
      :variant="cancelVariant"
      :size="size"
      :disabled="loading"
      @click="$emit('cancel')"
    >
      {{ cancelText }}
    </UButton>
    <UButton
      v-if="!hideConfirm"
      :color="confirmColor"
      variant="solid"
      :size="size"
      class="flex-1 sm:flex-none"
      :disabled="disabledGuardar"
      :loading="loading"
      @click="$emit('confirm')"
    >
      <template #leading>
        <UIcon v-if="confirmIcon" :name="confirmIcon" />
      </template>
      {{ confirmText }}
    </UButton>
  </div>
</template>

<script setup>
defineProps({
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
  confirmIcon: {
    type: String,
    default: ''
  },
  loading: {
    type: Boolean,
    default: false
  },
  disabledGuardar: {
    type: Boolean,
    default: false
  },
  size: {
    type: String,
    default: undefined
  },
  cancelVariant: {
    type: String,
    default: 'outline'
  },
  hideConfirm: {
    type: Boolean,
    default: false
  }
})

defineEmits(['confirm', 'cancel'])
</script>
