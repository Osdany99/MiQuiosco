<template>
  <BaseHeaderPage
    title="Quiosco"
    description="Stock en el punto de venta"
    leading-icon="i-lucide-store"
    :show-button="false"
  >
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
        <!-- La entrada se registra desde la acción de la fila en /almacen, así
             que aquí solo se lleva a esa vista. -->
        <UButton
          v-if="hayProductos"
          to="/almacen"
          label="Ir al almacén"
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

    <template v-else>
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
        <template #quiosco-cell="{ row }">
          <button
            type="button"
            class="font-mono text-primary hover:underline"
            @click="abrirDesgloseStock(row.original, 'quiosco')"
          >
            {{ row.original.quiosco }}
          </button>
        </template>
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
            <UTooltip v-if="perms.puedeAccion('quiosco', 'traspaso')" text="Reponer desde almacén" :delay-duration="0">
              <UButton
                icon="i-lucide-arrow-right-left"
                size="xs"
                color="neutral"
                variant="ghost"
                @click="abrirTraspasoDe(row.original.productoId)"
              />
            </UTooltip>
            <UTooltip v-if="perms.puedeAccion('quiosco', 'ajuste')" text="Merma / devolución" :delay-duration="0">
              <UButton
                icon="i-lucide-wrench"
                size="xs"
                color="neutral"
                variant="ghost"
                @click="abrirAjusteDe(row.original)"
              />
            </UTooltip>
            <UTooltip v-if="perms.puedeAccion('quiosco', 'ver_lotes')" text="Ver lotes" :delay-duration="0">
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
              <UTooltip v-if="perms.puedeAccion('quiosco', 'vender')" text="Vender" :delay-duration="0">
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
                    v-if="perms.puedeVenta('contado')"
                    block
                    variant="ghost"
                    color="neutral"
                    icon="i-lucide-pocket"
                    label="Venta directa (efectivo)"
                    class="justify-start"
                    @click="vender(row.original, 'venta')"
                  />
                  <UButton
                    v-if="perms.puedeVenta('fiado')"
                    block
                    variant="ghost"
                    color="neutral"
                    icon="i-lucide-hand-coins"
                    label="Deuda directa (fiado)"
                    class="justify-start"
                    @click="vender(row.original, 'deuda')"
                  />
                  <USeparator class="my-1" />
                  <UButton
                    v-if="perms.puedeVenta('casa')"
                    block
                    variant="ghost"
                    color="neutral"
                    icon="i-lucide-house"
                    label="Venta casa (al costo)"
                    class="justify-start"
                    @click="vender(row.original, 'casa')"
                  />
                  <UButton
                    v-if="perms.puedeVenta('familiar')"
                    block
                    variant="ghost"
                    color="neutral"
                    icon="i-lucide-users"
                    label="Venta familiar"
                    class="justify-start"
                    @click="vender(row.original, 'familiar')"
                  />
                  <UButton
                    v-if="perms.puedeVenta('regalo')"
                    block
                    variant="ghost"
                    color="neutral"
                    icon="i-lucide-gift"
                    label="Regalo"
                    class="justify-start"
                    @click="vender(row.original, 'regalo')"
                  />
                </div>
              </template>
            </UPopover>
          </div>
        </template>
      </UTable>
    </template>

    <InventarioDialogoTraspaso v-model="showTraspaso" :producto-id="productoTraspaso" @guardado="recargar" />
    <InventarioDialogoAjuste
      v-model="showAjuste"
      :producto-id="productoAjuste"
      ubicacion="quiosco"
      @guardado="recargar"
    />
    <InventarioTablaLotes v-model="showLotes" :producto="productoLotes" @guardado="recargar" />
    <InventarioDialogoVenta
      v-model="showVenta"
      :producto="productoVenta"
      ubicacion="quiosco"
      :modo="modoVenta"

      @guardado="recargar"
    />

    <InventarioDialogoDesgloseStock
      v-model="showDesgloseStock"
      :producto-id="desgloseProductoId"
      ubicacion="quiosco"
      :nombre-producto="desgloseNombre"
      :stock-total="desgloseStockTotal"
    />
  </BaseHeaderPage>
</template>

<script setup>
definePageMeta({
  middleware: ['jefe']
})

const {
  cargando, filas, colorEstado, textoEstado,
  visibleHeaders, columnHeaders, visibleColumns,
  abrirAjuste, abrirLotes, recargar, sinMovimientos, hayProductos,
  showAjuste, showLotes, productoAjuste, productoLotes,
  abrirVenta, showVenta, modoVenta, productoVenta
} = useVistaInventario('quiosco')

const perms = usePermisos()

const showTraspaso = ref(false)
const productoTraspaso = ref(null)

const showDesgloseStock = ref(false)
const desgloseProductoId = ref(null)
const desgloseNombre = ref('')
const desgloseStockTotal = ref(0)

function abrirDesgloseStock(row, ubicacion) {
  desgloseProductoId.value = row.productoId
  desgloseNombre.value = row.nombre
  desgloseStockTotal.value = ubicacion === 'quiosco' ? row.quiosco : row.almacen
  showDesgloseStock.value = true
}

// Solo un popover de venta abierto a la vez: guarda el id del producto cuyo
// menú está visible (null = ninguno).
const menuVentaId = ref(null)

function vender(fila, modo) {
  menuVentaId.value = null
  abrirVenta(fila, modo)
}

// El ajuste se abre en modo merma desde la llave inglesa de cada fila; dentro
// del diálogo el jefe puede pasarlo a devolución (siempre sale del quiosco).
function abrirAjusteDe(fila) {
  abrirAjuste(fila.productoId)
}

function abrirTraspasoDe(productoId) {
  productoTraspaso.value = productoId
  showTraspaso.value = true
}
</script>
