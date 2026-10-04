<template>
  <UCard>
    <template #header>
      <h3 class="font-semibold text-success">
        Cuadre cerrado
      </h3>
    </template>

    <div class="space-y-2 text-sm">
      <div class="flex justify-between">
        <span>Total esperado:</span>
        <span class="font-mono">{{ fmtPrecio(cuadre.totalEsperado) }}</span>
      </div>
      <div class="flex justify-between">
        <span>Dinero real:</span>
        <span class="font-mono">{{ fmtPrecio(cuadre.totalRealCaja ?? 0) }}</span>
      </div>
      <div class="flex justify-between">
        <span>Transferencia:</span>
        <span class="font-mono">{{ fmtPrecio(cuadre.montoTransferencia) }}</span>
      </div>
      <div class="flex justify-between">
        <span>Fiado generado:</span>
        <span class="font-mono">{{ fmtPrecio(cuadre.montoFiado) }}</span>
      </div>
      <div class="flex justify-between">
        <span>Cobrado fiado:</span>
        <span class="font-mono">{{ fmtPrecio(cuadre.montoCobradoFiado ?? 0) }}</span>
      </div>
      <div class="flex justify-between">
        <span>Regalos:</span>
        <span class="font-mono">{{ fmtPrecio(cuadre.montoRegalo ?? 0) }}</span>
      </div>
      <div class="flex justify-between">
        <span>Descuentos:</span>
        <span class="font-mono">{{ fmtPrecio(cuadre.montoDescuento ?? 0) }}</span>
      </div>
      <div class="flex justify-between font-bold">
        <span>Diferencia:</span>
        <span class="font-mono">{{ fmtPrecio(cuadre.diferencia ?? 0) }}</span>
      </div>
      <div v-if="cuadre.costoTotal != null" class="flex justify-between">
        <span>Costo (FIFO):</span>
        <span class="font-mono">{{ fmtPrecio(cuadre.costoTotal) }}</span>
      </div>
      <div v-if="cuadre.ganancia != null" class="flex justify-between font-semibold text-success">
        <span>Ganancia:</span>
        <span class="font-mono">{{ fmtPrecio(cuadre.ganancia) }}</span>
      </div>
      <div class="flex justify-between">
        <span>Trabajador:</span>
        <span>{{ nombreTrabajador }}</span>
      </div>
      <div class="flex justify-between">
        <span>Pago trabajador:</span>
        <span>{{ cuadre.pagoTrabajador ? fmtPrecio(cuadre.pagoTrabajador) : '—' }}</span>
      </div>
      <div class="flex justify-between">
        <span>Cerrado el:</span>
        <span>{{ cuadre.cerradoEn ? fmtDate(cuadre.cerradoEn) : '—' }}</span>
      </div>
      <div v-if="cuadre.notas" class="flex justify-between">
        <span>Notas:</span>
        <span>{{ cuadre.notas }}</span>
      </div>
      <div v-if="cuadre.reabiertoVeces > 0" class="text-warning text-sm">
        ⚠ Reabierto {{ cuadre.reabiertoVeces }} vez{{ cuadre.reabiertoVeces > 1 ? 'es' : '' }}
        (última: {{ cuadre.ultimaReaperturaEn ? fmtDate(cuadre.ultimaReaperturaEn) : '—' }})
      </div>
    </div>
  </UCard>
</template>

<script setup>
import { TABLES } from '../../../shared/tables'

const props = defineProps({
  cuadre: { type: Object, required: true }
})

// Sin toast: si la lista no carga, se muestra el id como respaldo.
const repo = useRepo(TABLES.usuarios, { toast: false })
const trabajadores = ref([])
const nombreTrabajador = computed(() => {
  if (!props.cuadre.trabajadorTurnoId) return '—'
  return trabajadores.value.find(t => t.id === props.cuadre.trabajadorTurnoId)?.nombre
    ?? props.cuadre.trabajadorTurnoId
})

onMounted(async () => {
  if (!props.cuadre.trabajadorTurnoId) return
  const { data } = await repo.readAll()
  if (Array.isArray(data)) trabajadores.value = data
})
</script>
