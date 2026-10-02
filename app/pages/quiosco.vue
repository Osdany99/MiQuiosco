<template>
  <BaseHeaderPage
    title="Quiosco"
    description="Stock en el punto de venta"
    leading-icon="i-lucide-store"
    :show-button="false"
  >
    <template #trailing>
      <UButton
        icon="i-lucide-arrow-right-left"
        variant="outline"
        label="Reponer"
        @click="showTraspaso = true"
      />
    </template>

    <UAlert
      v-if="sinMovimientos"
      icon="i-lucide-info"
      color="warning"
      variant="soft"
      :title="hayProductos ? 'Todavía no hay inventario' : 'Todavía no hay productos'"
      :description="hayProductos
        ? 'Registra una entrada al almacén para empezar a controlar el stock.'
        : 'Primero crea tus productos, después registra la mercadería que ya tienes guardada.'"
      class="mb-4"
    >
      <template #actions>
        <UButton
          v-if="hayProductos"
          to="/almacen?nueva=entrada"
          label="Registrar una compra"
          size="sm"
          color="warning"
          variant="solid"
        />
        <UButton
          v-else
          to="/productos"
          label="Crear productos"
          size="sm"
          color="warning"
          variant="solid"
        />
      </template>
    </UAlert>

    <div v-if="cargando" class="flex justify-center py-12">
      <UIcon name="i-lucide-loader-circle" class="animate-spin size-8 text-muted-foreground" />
    </div>

    <UTable
      v-else
      :data="filas"
      :columns="columns"
      empty="Sin productos"
    >
      <template #estado-cell="{ row }">
        <UBadge :color="colorEstado(row.original)" variant="soft">
          {{ textoEstado(row.original) }}
        </UBadge>
      </template>
      <template #costoActual-cell="{ row }">
        {{ fmtPrecio(row.original.costoActual) }}
      </template>
      <template #valorizadoQuiosco-cell="{ row }">
        {{ fmtPrecio(row.original.valorizadoQuiosco) }}
      </template>
      <template #acciones-cell="{ row }">
        <div class="flex gap-1 justify-end">
          <UTooltip text="Reponer desde almacén" :delay-duration="0">
            <UButton
              icon="i-lucide-arrow-right-left"
              size="xs"
              color="neutral"
              variant="ghost"
              @click="abrirTraspasoDe(row.original.productoId)"
            />
          </UTooltip>
          <UTooltip text="Merma / devolución" :delay-duration="0">
            <UButton
              icon="i-lucide-wrench"
              size="xs"
              color="neutral"
              variant="ghost"
              @click="abrirAjuste(row.original.productoId)"
            />
          </UTooltip>
          <UTooltip text="Ver lotes" :delay-duration="0">
            <UButton
              icon="i-lucide-package"
              size="xs"
              color="neutral"
              variant="ghost"
              @click="abrirLotes(row.original)"
            />
          </UTooltip>
        </div>
      </template>
    </UTable>

    <InventarioDialogoTraspaso v-model="showTraspaso" :preseleccion="preseleccion" @guardado="recargar" />
    <InventarioDialogoAjuste v-model="showAjuste" :producto-id="productoAjuste" @guardado="recargar" />
    <InventarioTablaLotes v-model="showLotes" :producto="productoLotes" @guardado="recargar" />
  </BaseHeaderPage>
</template>

<script setup>
definePageMeta({
  middleware: ['jefe']
})

const {
  cargando, filas, columns, colorEstado, textoEstado,
  abrirAjuste, abrirLotes, recargar, sinMovimientos, hayProductos,
  showAjuste, showLotes, productoAjuste, productoLotes
} = useVistaInventario('quiosco')

const showTraspaso = ref(false)
const preseleccion = ref([])

function abrirTraspasoDe(productoId) {
  preseleccion.value = [{ productoId, cantidad: 0 }]
  showTraspaso.value = true
}
</script>
