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
      <div class="flex justify-between font-bold">
        <span>Diferencia:</span>
        <span class="font-mono">{{ fmtPrecio(cuadre.diferencia ?? 0) }}</span>
      </div>
      <div class="flex justify-between">
        <span>Trabajador:</span>
        <span>{{ cuadre.trabajadorTurnoId || '—' }}</span>
      </div>
      <div class="flex justify-between">
        <span>Pago trabajador:</span>
        <span>{{ cuadre.pagoTrabajador ? fmtPrecio(cuadre.pagoTrabajador) : '—' }}</span>
      </div>
      <div class="flex justify-between">
        <span>Cerrado el:</span>
        <span>{{ cuadre.cerradoEn ? new Date(Number(cuadre.cerradoEn)).toLocaleString('es-ES') : '—' }}</span>
      </div>
      <div v-if="cuadre.notas" class="flex justify-between">
        <span>Notas:</span>
        <span>{{ cuadre.notas }}</span>
      </div>
      <div v-if="cuadre.reabiertoVeces > 0" class="text-warning text-sm">
        ⚠ Reabierto {{ cuadre.reabiertoVeces }} vez{{ cuadre.reabiertoVeces > 1 ? 'es' : '' }}
        (última: {{ cuadre.ultimaReaperturaEn ? new Date(Number(cuadre.ultimaReaperturaEn)).toLocaleString('es-ES') : '—' }})
      </div>
    </div>
  </UCard>
</template>

<script setup>
defineProps({
  cuadre: { type: Object, required: true }
})
</script>
