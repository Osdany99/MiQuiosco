<template>
  <UCard class="border-dashed">
    <div class="flex items-center justify-between">
      <div>
        <h4 class="font-medium">
          Importar registro de trabajador
        </h4>
        <p class="text-sm text-muted">
          Sobrescribe cantidades y precios con el archivo exportado por el trabajador.
        </p>
      </div>
      <UButton
        variant="outline"
        icon="i-lucide-upload"
        label="Importar JSON"
        @click="showImportar = true"
      />
    </div>

    <UModal v-model="showImportar" :ui="{ width: 'max-w-md' }">
      <template #header>
        Importar registro de trabajador
      </template>
      <div class="space-y-4">
        <UAlert color="info" icon="i-lucide-info" title="Esta acción reemplazará (no sumará) las líneas existentes que coincidan por ID de producto." />
        <UButton
          block
          variant="outline"
          icon="i-lucide-file-text"
          label="Seleccionar archivo .json"
          @click="importarRegistroTrabajador"
        />
      </div>
      <template #footer>
        <UButton variant="ghost" @click="showImportar = false">
          Cancelar
        </UButton>
      </template>
    </UModal>
  </UCard>
</template>

<script setup>
const { showImportar, importarRegistroTrabajador } = useCuadre()
</script>
