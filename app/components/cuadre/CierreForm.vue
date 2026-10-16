<template>
  <UCard>
    <template #header>
      <h3 class="font-semibold">
        Cierre de caja
      </h3>
    </template>

    <div class="space-y-4">
      <UFormField label="Dinero real en caja" required>
        <BaseInputNumber
          v-model="totalRealCaja"
          placeholder="0"
          :disabled="readonly"
        />
      </UFormField>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <UFormField label="Pago al trabajador">
          <BaseInputNumber
            v-model="pagoTrabajador"
            placeholder="0"
            :disabled="readonly"
            @update:model-value="marcarPagoManual"
          />
        </UFormField>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <UFormField label="Trabajador de turno">
          <USelectMenu
            v-model="trabajadorTurnoId"
            :items="trabajadores"
            value-key="id"
            label-key="nombre"
            placeholder="Seleccionar..."
            class="w-full"
            :disabled="readonly"
            :search-input="false"
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
    </div>
  </UCard>
</template>

<script setup>
import { TABLES } from '../../../shared/tables'

const usuarioConfig = TABLES.usuarios

const {
  totalRealCaja,
  trabajadorTurnoId, pagoTrabajador, notasCuadre,
  marcarPagoManual
} = useCuadre()

const repo = useRepo(usuarioConfig)
const trabajadores = ref([])

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
