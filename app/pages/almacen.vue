<template>
  <BaseHeaderPage
    title="Almacén"
    description="Compras y stock guardado"
    leading-icon="i-lucide-warehouse"
    title-button="Nueva entrada"
    @new="showEntrada = true"
  >
    <template #trailing>
      <UButton
        icon="i-lucide-arrow-right-left"
        variant="outline"
        label="Traspasar"
        @click="showTraspaso = true"
      />
    </template>

    <UAlert
      v-if="sinMovimientos"
      icon="i-lucide-info"
      color="warning"
      variant="soft"
      :title="hayProductos ? 'Todavía no hay entradas' : 'Todavía no hay productos'"
      :description="hayProductos
        ? 'Registra la mercadería que ya tienes guardada como entrada al almacén.'
        : 'Primero crea tus productos, después registra la mercadería que ya tienes guardada.'"
      class="mb-4"
    >
      <template #actions>
        <UButton
          v-if="hayProductos"
          label="Registrar entrada"
          size="sm"
          color="warning"
          variant="soft"
          @click="showEntrada = true"
        />
        <UButton
          v-else
          to="/productos"
          label="Crear productos"
          size="sm"
          color="warning"
          variant="soft"
        />
      </template>
    </UAlert>

    <UTabs v-model="tab" :items="tabs" class="mb-4" />

    <div v-if="cargando" class="flex justify-center py-12">
      <UIcon name="i-lucide-loader-circle" class="animate-spin size-8 text-muted-foreground" />
    </div>

    <UTable
      v-else-if="tab === 'stock'"
      :data="filas"
      :columns="columns"
      empty="Sin productos"
    >
      <template #nombre-cell="{ row }">
        <div class="min-w-0">
          <div class="font-medium truncate">
            {{ row.original.nombre }}
          </div>
          <div
            v-if="row.original.descripcion?.trim()"
            class="text-xs text-muted truncate"
          >
            {{ row.original.descripcion }}
          </div>
        </div>
      </template>
      <template #estado-cell="{ row }">
        <UBadge :color="colorEstado(row.original)" variant="soft">
          {{ textoEstado(row.original) }}
        </UBadge>
      </template>
      <template #costoActual-cell="{ row }">
        {{ fmtPrecio(row.original.costoActual) }}
      </template>
      <template #valorizadoAlmacen-cell="{ row }">
        {{ fmtPrecio(row.original.valorizadoAlmacen) }}
      </template>
      <template #acciones-cell="{ row }">
        <div class="flex gap-1 justify-end">
          <UTooltip text="Traspasar al quiosco" :delay-duration="0">
            <UButton
              icon="i-lucide-arrow-right-left"
              size="xs"
              color="neutral"
              variant="ghost"
              @click="abrirTraspasoDe(row.original.productoId)"
            />
          </UTooltip>
          <UTooltip text="Merma" :delay-duration="0">
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

    <UTable
      v-else
      :data="lotesHistorial"
      :columns="columnsHistorial"
      empty="Sin entradas registradas"
    >
      <template #nombreProducto-cell="{ row }">
        <div class="min-w-0">
          <div class="font-medium truncate">
            {{ row.original.nombreProducto }}
          </div>
          <div
            v-if="row.original.descripcionProducto?.trim()"
            class="text-xs text-muted truncate"
          >
            {{ row.original.descripcionProducto }}
          </div>
        </div>
      </template>
      <template #fechaEntrada-cell="{ row }">
        {{ row.original.fechaEntrada }}
      </template>
      <template #precioUnitario-cell="{ row }">
        {{ fmtPrecio(row.original.precioUnitario) }}
      </template>
      <template #valor-cell="{ row }">
        {{ fmtPrecio(Number(row.original.cantidadInicial || 0) * Number(row.original.precioUnitario || 0)) }}
      </template>
    </UTable>

    <InventarioDialogoEntrada v-model="showEntrada" @guardado="recargar" />
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
  cargando, filas, lotesHistorial, columns, columnsHistorial,
  colorEstado, textoEstado, abrirAjuste, abrirLotes, recargar, sinMovimientos, hayProductos,
  showAjuste, showLotes, productoAjuste, productoLotes
} = useVistaInventario('almacen')

const tab = ref('stock')
const tabs = [
  { label: 'Stock', value: 'stock' },
  { label: 'Historial de compras', value: 'historial' }
]

const showEntrada = ref(false)
const showTraspaso = ref(false)
const preseleccion = ref([])

const route = useRoute()
const router = useRouter()

// /almacen?nueva=entrada abre el diálogo directo (enlace desde el estado vacío de /quiosco).
onMounted(() => {
  if (route.query.nueva === 'entrada') {
    showEntrada.value = true
    router.replace({ query: { ...route.query, nueva: undefined } })
  }
})

function abrirTraspasoDe(productoId) {
  preseleccion.value = [{ productoId, cantidad: 0 }]
  showTraspaso.value = true
}
</script>
