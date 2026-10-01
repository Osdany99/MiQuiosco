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
      <UButton
        icon="i-lucide-truck"
        variant="outline"
        label="Proveedores"
        @click="showProveedores = true"
      />
    </template>

    <UAlert
      v-if="sinMovimientos"
      icon="i-lucide-info"
      color="warning"
      variant="soft"
      title="Todavía no hay entradas"
      description="Empieza con el conteo inicial de lo que ya tienes guardado, o registra tu primera compra."
      class="mb-4"
    >
      <template #actions>
        <UButton
          to="/inventario/setup"
          label="Ir al conteo inicial"
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
    <InventarioGestionProveedores v-model="showProveedores" />
  </BaseHeaderPage>
</template>

<script setup>
definePageMeta({
  middleware: ['jefe']
})

const {
  cargando, filas, lotesHistorial, columns, columnsHistorial,
  colorEstado, textoEstado, abrirAjuste, abrirLotes, recargar, sinMovimientos,
  showAjuste, showLotes, productoAjuste, productoLotes
} = useVistaInventario('almacen')

const tab = ref('stock')
const tabs = [
  { label: 'Stock', value: 'stock' },
  { label: 'Historial de compras', value: 'historial' }
]

const showEntrada = ref(false)
const showTraspaso = ref(false)
const showProveedores = ref(false)
const preseleccion = ref([])

function abrirTraspasoDe(productoId) {
  preseleccion.value = [{ productoId, cantidad: 0 }]
  showTraspaso.value = true
}
</script>
