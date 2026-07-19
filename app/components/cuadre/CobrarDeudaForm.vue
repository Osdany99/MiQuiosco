<template>
  <div class="space-y-4">
    <UFormField label="Cuenta de fiado" required>
      <USelectMenu
        v-model="model.cuentaFiadoId"
        :items="cuentas"
        value-key="id"
        label-key="label"
        placeholder="Seleccionar cuenta..."
        class="w-full"
      />
    </UFormField>
    <div class="grid grid-cols-2 gap-4">
      <UFormField label="Monto a pagar" required>
        <BaseInputNumber v-model="model.monto" placeholder="0" />
      </UFormField>
      <UFormField label="Forma de pago">
        <USelectMenu
          v-model="model.formaPago"
          :items="[
            { label: 'Efectivo', value: 'efectivo' },
            { label: 'Transferencia', value: 'transferencia' }
          ]"
          value-attribute="value"
          text-attribute="label"
          class="w-full"
        />
      </UFormField>
    </div>
  </div>
</template>

<script setup>
const model = defineModel({ type: Object, required: true })
const { cuentasConSaldoPendiente } = useCuentasFiado()
const cuentas = ref([])

onMounted(async () => {
  const raw = await cuentasConSaldoPendiente()
  cuentas.value = raw.map(c => ({
    id: c.id,
    label: `${c.id.slice(0, 8)}... — Saldo: ${fmtPrecio(Number(c.montoTotal) - Number(c.montoPagado))}`
  }))
})
</script>
