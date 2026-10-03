<script setup>
/**
 * Confirmar una recarga pendiente: ¿se pagó en el momento o queda fiada?
 *
 * El estado de pago NO se puede deducir del SMS (solo dice que la recarga se
 * hizo), así que se pregunta aquí. Es la razón de que las recargas no se
 * registren solas.
 */
const abierta = defineModel({ type: Boolean, default: false })

defineProps({
  recarga: { type: Object, default: null },
  cliente: { type: String, default: '' },
  guardando: { type: Boolean, default: false }
})

const emit = defineEmits(['confirmar'])

const estadoPago = ref('pendiente')

watch(abierta, (v) => {
  if (v) estadoPago.value = 'pendiente'
})

const OPCIONES = [
  {
    value: 'pagada',
    label: 'Ya la pagó',
    description: 'Se cobró en efectivo al momento.',
    icon: 'i-lucide-banknote'
  },
  {
    value: 'pendiente',
    label: 'Queda fiada',
    description: 'Es deuda: se cobra después.',
    icon: 'i-lucide-hand-coins'
  }
]
</script>

<template>
  <BaseDialog
    v-model="abierta"
    title="Añadir al historial"
    :description="`${Number(recarga?.montoNominal ?? 0)} CUP al ${recarga?.telefonoDestino ?? ''}${cliente ? ` · ${cliente}` : ''}`"
    confirm-text="Guardar"
    :loading="guardando"
    :disabled-guardar="!recarga"
    @confirm="emit('confirmar', estadoPago)"
    @cancel="abierta = false"
  >
    <div class="space-y-3">
      <div class="grid grid-cols-2 gap-2">
        <div class="rounded-lg border border-default p-3">
          <p class="text-xs text-muted">
            Ganancia
          </p>
          <p class="text-lg font-bold font-mono text-success">
            +{{ Number(recarga?.ganancia ?? 0) }}
          </p>
        </div>
        <div class="rounded-lg border border-default p-3">
          <p class="text-xs text-muted">
            Te cuesta
          </p>
          <p class="text-lg font-bold font-mono">
            {{ Number(recarga?.costo ?? 0) }}
          </p>
        </div>
      </div>

      <p class="text-sm text-muted">
        ¿Cómo se cobró esta recarga?
      </p>

      <button
        v-for="o in OPCIONES"
        :key="o.value"
        type="button"
        class="w-full flex items-center gap-3 rounded-lg border p-3 text-left transition"
        :class="estadoPago === o.value
          ? 'border-primary bg-primary/5'
          : 'border-default hover:border-primary/40'"
        @click="estadoPago = o.value"
      >
        <UIcon
          :name="o.icon"
          class="size-5 shrink-0"
          :class="estadoPago === o.value ? 'text-primary' : 'text-muted'"
        />
        <span class="min-w-0">
          <span class="block text-sm font-medium">
            {{ o.label }}
          </span>
          <span class="block text-xs text-muted">
            {{ o.description }}
          </span>
        </span>
      </button>
    </div>
  </BaseDialog>
</template>
