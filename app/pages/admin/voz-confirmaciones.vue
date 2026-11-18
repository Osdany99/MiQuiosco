<script setup>
definePageMeta({
  layout: 'admin',
  middleware: ['super-admin']
})

// La vista vive ahora en la tercera pestaña de /admin/voz. Se conserva esta
// ruta para que los enlaces y marcadores antiguos no den 404.
onMounted(() => {
  void navigateTo('/admin/voz?vista=confirmaciones', { replace: true })
})
</script>

<template>
  <div />
</template>
