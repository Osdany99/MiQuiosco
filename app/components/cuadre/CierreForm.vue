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
          <p class="font-mono text-lg">
            {{ fmtPrecio(montoFiado) }}
          </p>
        </UFormField>

        <UFormField label="Cobrado hoy de deudas anteriores">
          <p class="font-mono text-lg">
            {{ fmtPrecio(montoCobradoFiado) }}
          </p>
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
      <p v-if="trabajadorTurnoId && salarioCalculado" class="text-xs text-gray-500 -mt-3">
        Salario calculado: {{ fmtPrecio(salarioCalculado) }} (base {{ fmtPrecio(salarioBase) }} + bono por ventas). Editable manualmente.
      </p>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <UFormField label="Trabajador de turno">
          <USelectMenu
            v-model="trabajadorTurnoId"
            :items="trabajadores"
            value-attribute="id"
            text-attribute="nombre"
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
const usuarioConfig = { tabla: 'usuarios', endpoints: { list: '/api/usuarios', byId: id => `/api/usuarios/${id}` }, puestoScoped: true }

const {
  totalRealCaja, montoTransferencia, montoFiado, montoCobradoFiado,
  trabajadorTurnoId, pagoTrabajador, notasCuadre,
  salarioCalculado, diferencia, tipoDiferencia
} = useCuadre()

const repo = useRepo(usuarioConfig)
const trabajadores = ref([])
const salarioBase = computed(() => {
  if (!trabajadorTurnoId.value) return 0
  const t = trabajadores.value.find(t => t.id === trabajadorTurnoId.value)
  return t?.salario ?? 600
})

onMounted(async () => {
  const { data: users } = await repo.readAll()
  if (Array.isArray(users)) {
    trabajadores.value = users.filter(u => u.rol === 'trabajador')
  }
})

defineProps({
  readonly: { type: Boolean, default: false }
})
</script>
