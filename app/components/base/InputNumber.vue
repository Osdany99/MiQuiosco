<script setup>
defineOptions({ inheritAttrs: false })

defineProps({
  size: { type: String, default: 'sm' },
  min: { type: Number, default: 0 },
  step: { type: Number, default: undefined },
  disabled: { type: Boolean, default: false },
  readonly: { type: Boolean, default: false },
  required: { type: Boolean, default: false },
  locale: { type: String, default: 'es-ES' },
  stepSnapping: { type: Boolean, default: false },
  placeholder: { type: String, default: undefined }
})
</script>

<template>
  <UInputNumber
    :size="size"
    :min="min"
    :step="step"
    :disabled="disabled"
    :readonly="readonly"
    :required="required"
    :locale="locale"
    :step-snapping="stepSnapping"
    :placeholder="placeholder"
    v-bind="$attrs"
  >
    <template v-for="(_, name) in $slots" #[name]="data">
      <slot :name="name" v-bind="data" />
    </template>
  </UInputNumber>
</template>
