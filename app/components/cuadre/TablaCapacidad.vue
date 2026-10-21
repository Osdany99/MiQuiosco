<template>
  <div>
    <UCard :ui="{ body: { padding: 'p-0' } }" class="relative">
      <TableLoading v-if="cargando" :loading="cargando" />

      <TableError v-else-if="error" :error="error" @retry="emit('recargar')" />

      <div v-else-if="!filas.length" class="px-4 py-12 text-center">
        <UIcon name="i-lucide-package-open" class="size-8 text-muted mx-auto" />
        <p class="mt-2 text-sm font-medium">
          Sin productos que mostrar
        </p>
        <p class="mt-1 text-xs text-muted">
          Prueba con otro mes, quita la búsqueda o desactiva "solo con movimientos".
        </p>
      </div>

      <!-- La matriz es una tabla normal con la primera columna fija: con 31 días
           de columnas, sin el producto a la vista no se sabe a qué número se
           está mirando. -->
      <div v-else class="overflow-x-auto">
        <table class="text-sm border-collapse">
          <thead>
            <tr>
              <th
                scope="col"
                class="sticky left-0 z-20 bg-default border-b border-r border-default px-3 py-2 text-left font-semibold min-w-44"
              >
                Producto
              </th>
              <th
                v-for="col in columnas"
                :key="col.dia"
                scope="col"
                class="border-b border-default px-0 py-1 text-center min-w-11"
                :class="col.esHoy ? 'bg-primary/10' : ''"
              >
                <div class="text-[10px] uppercase leading-tight text-muted">
                  {{ col.diaSemana }}
                </div>
                <div
                  class="font-mono text-sm font-semibold leading-tight"
                  :class="col.esHoy ? 'text-primary' : ''"
                >
                  {{ col.numero }}
                </div>
                <div class="mt-0.5 h-1" />
              </th>
            </tr>
          </thead>

          <tbody>
            <tr
              v-for="fila in filas"
              :key="fila.productoId"
              class="border-b border-default last:border-b-0"
            >
              <th
                scope="row"
                class="sticky left-0 z-10 bg-default border-r border-default px-3 py-1.5 text-left font-normal align-top"
              >
                <div class="flex items-start gap-1.5">
                  <div class="min-w-0 flex-1">
                    <div class="font-medium truncate">
                      {{ fila.nombre }}
                    </div>
                    <div
                      v-if="fila.descripcion?.trim()"
                      class="text-xs text-muted truncate"
                    >
                      {{ fila.descripcion }}
                    </div>
                  </div>
                  <UTooltip
                    v-if="!fila.seVende"
                    :text="fila.activo ? 'No se vende en el quiosco' : 'Producto desactivado'"
                    :delay-duration="0"
                  >
                    <UIcon
                      name="i-lucide-eye-off"
                      class="size-3.5 shrink-0 mt-0.5 text-warning"
                    />
                  </UTooltip>
                </div>
              </th>

              <td
                v-for="col in columnas"
                :key="col.dia"
                class="px-0 py-1.5 text-center align-top"
                :class="col.esHoy ? 'bg-primary/5' : ''"
              >
                <!-- Con prefijo de carpeta: el nombre auto-importado es
                     CuadreCeldaDia, no CeldaDia. Sin él Vue resuelve un elemento
                     desconocido y la celda sale vacía. -->
                <CuadreCeldaDia
                  :celda="fila.celdas.get(col.dia)"
                  @abrir="emit('abrir', { fila, dia: col.dia })"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>
  </div>
</template>

<script setup>
defineProps({
  filas: { type: Array, default: () => [] },
  columnas: { type: Array, default: () => [] },
  cargando: { type: Boolean, default: false },
  /** Mensaje de error, o null si todo bien. TableError espera algo truthy. */
  error: { type: [String, Object, Boolean], default: null }
})

const emit = defineEmits(['abrir', 'recargar'])
</script>
