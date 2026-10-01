<script setup>
/**
 * Ruta heredada: la vista única se dividió en /quiosco y /almacen.
 * Se redirige al almacén, que es por donde entra todo lo que se compra.
 */
definePageMeta({
  middleware: ['jefe']
})

await navigateTo('/almacen', { replace: true })
</script>

<template>
  <div />
</template>
