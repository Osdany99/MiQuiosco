<template>
  <div class="space-y-4">
    <div class="rounded-md border border-gray-200 p-3 dark:border-gray-800">
      <div class="flex justify-between text-sm">
        <span class="text-muted">{{ recarga?.nombreCliente ?? 'Cliente' }}</span>
        <span class="font-mono font-medium">{{ fmtPrecio(saldo) }}</span>
      </div>
      <p class="mt-1 text-xs text-muted">
        {{ recarga?.telefonoDestino }}
        ·
        {{ formatearFecha(recarga?.creadoEn) }}
      </p>
      <p class="mt-1 text-xs text-muted">
        Nominal {{ fmtPrecio(recarga?.montoNominal) }} · cobrado
        {{ fmtPrecio(recarga?.montoCobrado) }}
      </p>
    </div>

    <UFormField label="Monto a cobrar" required>
      <BaseInputNumber v-model="model.monto" placeholder="0" />
    </UFormField>

    <div class="flex gap-2">
      <UButton
        size="xs"
        variant="soft"
        label="Saldar todo"
        :disabled="model.monto === saldo"
        @click="model.monto = saldo"
      />
      <UButton
        size="xs"
        variant="soft"
        label="Mitad"
        @click="model.monto = Math.round(saldo / 2 * 100) / 100"
      />
    </div>

    <UFormField label="Forma de pago">
      <USelectMenu
        v-model="model.formaPago"
        :items="[
          { label: 'Efectivo', value: 'efectivo' },
          { label: 'Transferencia', value: 'transferencia' }
        ]"
        value-key="value"
        label-key="label"
        class="w-full"
        :search-input="false"
      />
    </UFormField>

    <UAlert
      v-if="Number(model.monto) > saldo"
      color="error"
      variant="soft"
      icon="i-lucide-triangle-alert"
      title="Supera el saldo"
      :description="`El saldo pendiente es ${fmtPrecio(saldo)}.`"
    />
  </div>
</template>

<script setup>
/**
 * Cobro (total o parcial) de una recarga fiada. Mismo criterio que en Deudas:
 * el saldo baja con cada abono y la recarga se marca pagada sola al cubrir el
 * nominal.
 */
const props = defineProps({
  recarga: { type: Object, default: null }
})

const model = defineModel({ type: Object, required: true })

const saldo = computed(() => {
  if (!props.recarga) return 0
  const total = Number(props.recarga.montoNominal) || 0
  const cobrado = Number(props.recarga.montoCobrado) || 0
  return Math.round((total - cobrado) * 100) / 100
})

// Al cambiar de recarga el monto arranca en el saldo completo (lo habitual es
// saldar) pero se puede bajar a un abono parcial.
watch(() => props.recarga?.id, () => {
  if (!model.value.formaPago) model.value.formaPago = 'efectivo'
  model.value.monto = saldo.value
}, { immediate: true })

function formatearFecha(v) {
  if (!v) return '—'
  try {
    return new Date(v).toLocaleDateString('es-MX')
  } catch {
    return String(v)
  }
}
</script>
