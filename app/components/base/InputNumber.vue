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
  placeholder: { type: String, default: undefined },
  increment: { type: Boolean, default: true },
  decrement: { type: Boolean, default: true }
})

const modelValue = defineModel({ type: Number, default: 0 })

// Al enfocar se selecciona todo: da igual dónde caiga el dedo,
// escribir reemplaza el valor (nunca "010" ni "100" partiendo de 0).
function seleccionarTodo(e) {
  const el = e?.target?.tagName === 'INPUT' ? e.target : e?.target?.querySelector?.('input')
  el?.select?.()
}

// Vacío / null / NaN (p. ej. borrar el 0) se normaliza a 0: el modelo nunca es NaN.
function alActualizar(v) {
  modelValue.value = (v === null || v === undefined || Number.isNaN(v)) ? 0 : v
}
</script>

<template>
  <UInputNumber
    :model-value="modelValue"
    :size="size"
    :min="min"
    :step="step"
    :disabled="disabled"
    :readonly="readonly"
    :required="required"
    :locale="locale"
    :step-snapping="stepSnapping"
    :placeholder="placeholder"
    :increment="increment"
    :decrement="decrement"
    v-bind="$attrs"
    @update:model-value="alActualizar"
    @focus="seleccionarTodo"
  >
    <template v-for="(_, name) in $slots" #[name]="data">
      <slot :name="name" v-bind="data" />
    </template>
  </UInputNumber>
</template>
