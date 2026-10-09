<template>
  <div class="space-y-4">
    <UAlert
      v-if="!deuda"
      color="warning"
      variant="soft"
      icon="i-lucide-info"
      title="Elige una deuda"
      description="Selecciona primero la deuda que vas a cobrar."
    />

    <template v-else>
      <div class="rounded-md border border-gray-200 p-3 dark:border-gray-800">
        <div class="flex justify-between text-sm">
          <span class="text-muted">{{ deuda.nombreCliente ?? 'Cliente' }}</span>
          <span class="font-mono font-medium">{{ fmtPrecio(saldo) }}</span>
        </div>
        <p class="mt-1 text-xs text-muted">
          {{ deuda.directa ? 'Deuda directa (fuera de cuadre)' : `Del cuadre del ${formatearFecha(deuda.creadoEn)}` }}
        </p>
      </div>

      <UFormField label="Monto a pagar" required>
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
        color="info"
        variant="soft"
        icon="i-lucide-info"
        title="Cobro directo"
        description="El jefe cobra en físico y ningún cuadre registra el dinero. Solo baja el saldo de la deuda."
      />
    </template>
  </div>
</template>

<script setup>
const props = defineProps({
  deuda: { type: Object, default: null }
})

const model = defineModel({ type: Object, required: true })

const saldo = computed(() => {
  if (!props.deuda) return 0
  const total = Number(props.deuda.montoTotal) || 0
  const pagado = Number(props.deuda.montoPagado) || 0
  return Math.round((total - pagado) * 100) / 100
})

// Al cambiar de deuda, el monto arranca en el saldo completo (lo habitual es
// saldar) pero se puede bajar a un abono parcial.
watch(() => props.deuda?.id, () => {
  model.value.monto = saldo.value
}, { immediate: true })

function formatearFecha(v) {
  if (!v) return ''
  try {
    return new Date(v).toLocaleDateString('es-MX')
  } catch {
    return String(v)
  }
}
</script>
