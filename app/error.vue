<script setup>
defineProps({
  error: {
    type: Object,
    required: true
  }
})

useSeoMeta({
  title: 'Página no encontrada',
  description: 'Lo sentimos, esta página no pudo ser encontrada.'
})

useHead({
  htmlAttrs: {
    lang: 'es'
  }
})
</script>

<template>
  <UApp>
    <UError :error="error" />
  </UApp>
</template>
