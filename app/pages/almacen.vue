<template>
  <BaseHeaderPage
    title="Almacén"
    description="Compras y stock guardado"
    leading-icon="i-lucide-warehouse"
    :show-button="false"
  >
    <UAlert
      v-if="sinMovimientos"
      icon="i-lucide-info"
      color="warning"
      variant="soft"
      :title="hayProductos ? 'Todavía no hay entradas' : 'Todavía no hay productos'"
      :description="hayProductos
        ? 'Usa la acción de cada producto para registrar la mercadería que ya tienes guardada.'
        : 'Primero crea tus productos, después registra la mercadería que ya tienes guardada.'"
      class="mb-4"
    >
      <template #actions>
        <UButton
          v-if="!hayProductos"
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

    <template v-else-if="tab === 'stock'">
      <div class="flex justify-end mb-2">
        <TableToolbar
          v-model:visible-headers="visibleHeaders"
          :column-headers="columnHeaders"
        />
      </div>

      <UTable
        :data="filas"
        :columns="visibleColumns"
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
            <UTooltip text="Añadir lote (entrada)" :delay-duration="0">
              <UButton
                icon="i-lucide-package-plus"
                size="xs"
                color="neutral"
                variant="ghost"
                @click="abrirEntradaDe(row.original.productoId)"
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
            <!-- Vender es un solo botón con submenú: la fila ya trae 3 acciones y
                 en móvil la columna no puede crecer más. -->
            <UPopover
              :open="menuVentaId === row.original.productoId"
              @update:open="(v) => { if (!v) menuVentaId = null }"
            >
              <UTooltip text="Vender" :delay-duration="0">
                <UButton
                  icon="i-lucide-receipt"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  aria-label="Vender"
                  @click="menuVentaId = row.original.productoId"
                />
              </UTooltip>
              <template #content>
                <div class="p-1 min-w-44">
                  <UButton
                    block
                    variant="ghost"
                    color="neutral"
                    icon="i-lucide-pocket"
                    label="Venta directa (efectivo)"
                    class="justify-start"
                    @click="vender(row.original, 'venta')"
                  />
                  <UButton
                    block
                    variant="ghost"
                    color="neutral"
                    icon="i-lucide-hand-coins"
                    label="Deuda directa (fiado)"
                    class="justify-start"
                    @click="vender(row.original, 'deuda')"
                  />
                </div>
              </template>
            </UPopover>
          </div>
        </template>
      </UTable>
    </template>

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

    <InventarioDialogoEntrada v-model="showEntrada" :producto-id="productoEntrada" @guardado="recargar" />
    <InventarioDialogoTraspaso v-model="showTraspaso" :producto-id="productoTraspaso" @guardado="recargar" />
    <InventarioDialogoAjuste
      v-model="showAjuste"
      :producto-id="productoAjuste"
      ubicacion="almacen"
      @guardado="recargar"
    />
    <InventarioTablaLotes v-model="showLotes" :producto="productoLotes" @guardado="recargar" />
    <InventarioDialogoVenta
      v-model="showVenta"
      :producto="productoVenta"
      ubicacion="almacen"
      :modo="modoVenta"
      @guardado="recargar"
    />
  </BaseHeaderPage>
</template>

<script setup>
definePageMeta({
  middleware: ['jefe']
})

const {
  cargando, filas, lotesHistorial, columnsHistorial,
  visibleHeaders, columnHeaders, visibleColumns,
  colorEstado, textoEstado, abrirAjuste, abrirLotes, recargar, sinMovimientos, hayProductos,
  showAjuste, showLotes, productoAjuste, productoLotes,
  abrirVenta, showVenta, modoVenta, productoVenta
} = useVistaInventario('almacen')

const tab = ref('stock')
const tabs = [
  { label: 'Stock', value: 'stock' },
  { label: 'Historial de compras', value: 'historial' }
]

const showEntrada = ref(false)
const showTraspaso = ref(false)
const productoEntrada = ref(null)
const productoTraspaso = ref(null)

// Solo un popover de venta abierto a la vez: guarda el id del producto cuyo
// menú está visible (null = ninguno).
const menuVentaId = ref(null)

function vender(fila, modo) {
  menuVentaId.value = null
  abrirVenta(fila, modo)
}

function abrirEntradaDe(productoId) {
  productoEntrada.value = productoId
  showEntrada.value = true
}

function abrirTraspasoDe(productoId) {
  productoTraspaso.value = productoId
  showTraspaso.value = true
}
</script>
