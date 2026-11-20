<template>
  <div class="min-w-0">
    <p class="font-medium truncate">
      {{ nombre || '—' }}
    </p>
    <p v-if="descripcion?.trim()" class="text-xs text-muted truncate">
      {{ descripcion }}
    </p>
  </div>
</template>

<script setup>
/**
 * Nombre de producto con su descripción debajo.
 *
 * Se repite en tablas y diálogos; tenerlo en un solo sitio evita que unas
 * vistas muestren la descripción y otras no (y que el orden/estilo cambie).
 */
defineProps({
  nombre: { type: String, default: '' },
  descripcion: { type: String, default: null }
})
</script>
