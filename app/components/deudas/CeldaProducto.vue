<template>
  <div v-if="items?.length" class="min-w-0 max-w-44">
    <template v-for="(it, i) in items" :key="it.id || i">
      <p class="truncate font-medium">
        {{ it.nombre }} <span class="text-muted">×{{ it.cantidad }}</span>
      </p>
      <p class="truncate text-xs text-muted">
        <span v-if="it.descripcion">{{ it.descripcion }} · </span>
        <span class="font-mono">{{ fmtPrecio(it.precioVentaUsado) }}</span>
      </p>
    </template>
  </div>
  <span v-else class="text-muted">—</span>
</template>

<script setup>
/**
 * Producto de una deuda, con el mismo formato que la tabla del cuadre: nombre
 * con la cantidad y, debajo, la descripción con el precio al que se fió.
 * Las recargas no tienen producto, así que muestran un guion.
 */
defineProps({
  items: { type: Array, default: () => [] }
})
</script>
