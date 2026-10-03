<template>
  <div v-if="pagination" class="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5">
    <div class="flex items-center gap-2">
      <span class="text-xs text-muted">
        {{ total }} resultado{{ total !== 1 ? 's' : '' }}
      </span>
      <USelect
        :model-value="pageCount"
        :items="OPCIONES_FILAS"
        value-key="value"
        label-key="label"
        size="xs"
        class="w-24"
        :search-input="false"
        aria-label="Filas por página"
        @update:model-value="cambiarFilas"
      />
    </div>

    <div class="flex items-center gap-0.5">
      <UButton
        icon="i-lucide-chevrons-left"
        size="xs"
        variant="ghost"
        color="neutral"
        aria-label="Primera página"
        :disabled="page <= 1"
        @click="page = 1"
      />
      <UButton
        icon="i-lucide-chevron-left"
        size="xs"
        variant="ghost"
        color="neutral"
        aria-label="Página anterior"
        :disabled="page <= 1"
        @click="page = page - 1"
      />
      <span class="min-w-14 px-1 text-center text-xs font-medium tabular-nums">
        {{ page }} / {{ totalPaginas }}
      </span>
      <UButton
        icon="i-lucide-chevron-right"
        size="xs"
        variant="ghost"
        color="neutral"
        aria-label="Página siguiente"
        :disabled="page >= totalPaginas"
        @click="page = page + 1"
      />
      <UButton
        icon="i-lucide-chevrons-right"
        size="xs"
        variant="ghost"
        color="neutral"
        aria-label="Última página"
        :disabled="page >= totalPaginas"
        @click="page = totalPaginas"
      />
    </div>
  </div>
</template>

<script setup>
/**
 * Barra de paginación compacta.
 *
 * Antes se usaba `UPagination`, que con sus valores por defecto (`siblingCount: 2`,
 * `showEdges: false`) pinta hasta 7 botones de número más dos elipsis: en móvil
 * ocupa media pantalla y no se ve bien. Aquí solo hay Anterior / pág. X de Y /
 * Siguiente, con primera y última, más un selector de filas por página que era
 * lo que más faltaba: con 150 clientes y 10 filas por página había 15 páginas.
 *
 * `pageCount` es two-way para que el selector pueda cambiar el tamaño de página.
 */
const page = defineModel({ type: Number, required: true })
const pageCount = defineModel('pageCount', { type: Number, required: true })

const props = defineProps({
  pagination: { type: Boolean, default: true },
  total: { type: Number, required: true }
})

const OPCIONES_FILAS = [
  { label: '10', value: 10 },
  { label: '25', value: 25 },
  { label: '50', value: 50 },
  { label: '100', value: 100 }
]

const totalPaginas = computed(() => Math.max(1, Math.ceil(props.total / (pageCount.value || 10))))

function cambiarFilas(valor) {
  pageCount.value = Number(valor)
}

// Cambiar el tamaño de página puede dejar la página actual más allá del final:
// se vuelve a la primera en vez de mostrar una tabla vacía sin explicación.
watch(pageCount, () => {
  page.value = 1
})
</script>
