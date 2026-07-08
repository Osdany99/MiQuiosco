<template>
  <UCard>
    <template #header>
      <h3 class="font-semibold">
        Cierre de caja
      </h3>
    </template>

    <div class="space-y-4">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <UFormField label="Dinero real en caja" required>
          <BaseInputNumber
            v-model="totalRealCaja"
            placeholder="0"
            :disabled="readonly"
          />
        </UFormField>

        <UFormField label="Monto en transferencia">
          <BaseInputNumber
            v-model="montoTransferencia"
            placeholder="0"
            :disabled="readonly"
          />
        </UFormField>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <UFormField label="Monto fiado / por cobrar (generado hoy)">
          <p class="font-mono text-lg">{{ fmtPrecio(montoFiado) }}</p>
        </UFormField>

        <UFormField label="Cobrado hoy de deudas anteriores">
          <p class="font-mono text-lg">{{ fmtPrecio(montoCobradoFiado) }}</p>
        </UFormField>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <UFormField label="Pago al trabajador">
          <BaseInputNumber
            v-model="pagoTrabajador"
            placeholder="0"
            :disabled="readonly"
          />
        </UFormField>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <UFormField label="Trabajador de turno">
          <USelectMenu
            v-model="trabajadorTurnoId"
            :items="[
              { label: 'Sin asignar', value: '' },
              { label: 'Juan', value: 'trabajador-1' },
              { label: 'María', value: 'trabajador-2' }
            ]"
            placeholder="Seleccionar..."
            class="w-full"
            :disabled="readonly"
          />
        </UFormField>

        <UFormField label="Notas">
          <UTextarea
            v-model="notasCuadre"
            placeholder="Observaciones del cierre..."
            :rows="3"
            :disabled="readonly"
          />
        </UFormField>
      </div>

      <div
        class="flex items-center justify-between p-4 rounded-lg"
        :class="{
          'bg-green-100 text-green-800': tipoDiferencia === 'exacto',
          'bg-blue-100 text-blue-800': tipoDiferencia === 'sobrante',
          'bg-red-100 text-red-800': tipoDiferencia === 'faltante',
          'bg-gray-100 text-gray-600': tipoDiferencia === null
        }"
      >
        <span class="font-semibold">
          {{ tipoDiferencia === 'exacto' ? '✓ Cuadre exacto'
            : tipoDiferencia === 'sobrante' ? '▲ Sobrante'
              : tipoDiferencia === 'faltante' ? '▼ Faltante'
                : '— Ingresa dinero real en caja' }}
        </span>
        <span v-if="diferencia !== null" class="text-xl font-mono font-bold">
          {{ fmtPrecio(diferencia) }}
        </span>
      </div>
    </div>
  </UCard>
</template>

<script setup>
const {
  totalRealCaja, montoTransferencia, montoFiado, montoCobradoFiado,
  trabajadorTurnoId, pagoTrabajador, notasCuadre,
  diferencia, tipoDiferencia
} = useCuadre()

defineProps({
  readonly: { type: Boolean, default: false }
})
</script>
