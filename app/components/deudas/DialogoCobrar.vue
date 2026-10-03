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

      <!-- El destino del dinero es la decisión que más conviene tomar a mano:
           el jefe sabe si el billete entró a la gaveta o se lo llevó. -->
      <UFormField label="¿Dónde quedó el dinero?">
        <div class="space-y-2 w-full">
          <label
            v-for="opcion in opciones"
            :key="opcion.value"
            class="flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors"
            :class="model.destino === opcion.value
              ? 'border-primary bg-primary/5'
              : 'border-gray-200 dark:border-gray-800 hover:bg-elevated/50'"
          >
            <input
              v-model="model.destino"
              type="radio"
              :value="opcion.value"
              class="mt-1 accent-primary"
            >
            <div class="min-w-0">
              <p class="text-sm font-medium">
                {{ opcion.label }}
              </p>
              <p class="text-xs text-muted">
                {{ opcion.ayuda }}
              </p>
            </div>
          </label>
        </div>
      </UFormField>

      <UAlert
        v-if="model.destino === 'caja' && !cuadreAbierto"
        color="warning"
        variant="soft"
        icon="i-lucide-triangle-alert"
        title="No hay cuadre abierto"
        description="Abre el cuadre del día para poder registrar el cobro en la gaveta. Si el jefe cobró por fuera, elige cobro directo."
      />
    </template>
  </div>
</template>

<script setup>
const props = defineProps({
  deuda: { type: Object, default: null },
  cuadreAbierto: { type: Object, default: null }
})

const model = defineModel({ type: Object, required: true })

const saldo = computed(() => {
  if (!props.deuda) return 0
  const total = Number(props.deuda.montoTotal) || 0
  const pagado = Number(props.deuda.montoPagado) || 0
  return Math.round((total - pagado) * 100) / 100
})

const opciones = computed(() => [
  {
    value: 'directo',
    label: 'Cobro directo — no entró a caja',
    ayuda: 'El jefe lo cobró por fuera. El saldo baja igual, pero ningún cuadre registra el dinero.'
  },
  {
    value: 'caja',
    label: 'Entró a la gaveta del cuadre de hoy',
    ayuda: props.cuadreAbierto
      ? `Se suma al cobrado de "${props.cuadreAbierto.fecha}".`
      : 'Requiere un cuadre abierto.'
  }
])

// Al cambiar de deuda, el monto arranca en el saldo completo (lo habitual es
// saldar) pero se puede bajar a un abono parcial.
watch(() => props.deuda?.id, () => {
  if (!model.value.destino) model.value.destino = 'directo'
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
