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
        <template #almacen-cell="{ row }">
          <button
            type="button"
            class="font-mono text-primary hover:underline"
            @click="abrirDesgloseStock(row.original, 'almacen')"
          >
            {{ row.original.almacen }}
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
        <template #valorizadoAlmacen-cell="{ row }">
          {{ fmtPrecio(row.original.valorizadoAlmacen) }}
        </template>
        <template #acciones-cell="{ row }">
          <div class="flex gap-1 justify-end">
            <UTooltip v-if="perms.puedeAccion('almacen', 'traspaso')" text="Traspasar al quiosco" :delay-duration="0">
              <UButton
                icon="i-lucide-arrow-right-left"
                size="xs"
                color="neutral"
                variant="ghost"
                @click="abrirTraspasoDe(row.original.productoId)"
              />
            </UTooltip>
            <UTooltip v-if="perms.puedeAccion('almacen', 'ajuste')" text="Merma" :delay-duration="0">
              <UButton
                icon="i-lucide-wrench"
                size="xs"
                color="neutral"
                variant="ghost"
                @click="abrirAjuste(row.original.productoId)"
              />
            </UTooltip>
            <UTooltip v-if="perms.puedeAccion('almacen', 'entrada')" text="Añadir lote (entrada)" :delay-duration="0">
              <UButton
                icon="i-lucide-package-plus"
                size="xs"
                color="neutral"
                variant="ghost"
                @click="abrirEntradaDe(row.original.productoId)"
              />
            </UTooltip>
            <UTooltip v-if="perms.puedeAccion('almacen', 'ver_lotes')" text="Ver lotes" :delay-duration="0">
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
              <UTooltip v-if="perms.puedeAccion('almacen', 'vender')" text="Vender" :delay-duration="0">
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

    <template v-else>
      <BaseTable
        :data="lotesHistorialFiltrados"
        :columns="columnsHistorial"
        empty-state="Sin entradas registradas"
        :show-edit="false"
        :show-delete="false"
        :disable-filters="true"
        :show-reset="false"
      >
        <template #toolbar-leading>
          <UInput
            v-model="busquedaHistorial"
            icon="i-lucide-search"
            placeholder="Buscar producto..."
            class="w-56"
          />
          <USelect
            v-model="filtroHistorial"
            :items="filtrosHistorial"
            class="w-40"
          />
          <USwitch v-model="incluirAnulados" label="Incluir anulados" />
        </template>

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
        <template #saldo-cell="{ row }">
          <span class="whitespace-nowrap">
            Alm: {{ row.original.saldoAlmacen }} · Quiosco: {{ row.original.saldoQuiosco }}
          </span>
        </template>
        <template #valor-cell="{ row }">
          {{ fmtPrecio(Number(row.original.cantidadInicial || 0) * Number(row.original.precioUnitario || 0)) }}
        </template>
        <template #valorRestante-cell="{ row }">
          {{ fmtPrecio(row.original.valorRestante) }}
        </template>
        <template #acciones-cell="{ row }">
          <div class="flex gap-1 justify-end">
            <UTooltip text="Ver detalle del lote" :delay-duration="0">
              <UButton
                icon="i-lucide-eye"
                size="xs"
                color="neutral"
                variant="ghost"
                aria-label="Ver detalle del lote"
                @click="abrirDetalleLote(row.original)"
              />
            </UTooltip>
            <UTooltip text="Corregir cantidad o precio" :delay-duration="0">
              <UButton
                v-if="!row.original.anulado"
                icon="i-lucide-pencil"
                size="xs"
                color="neutral"
                variant="ghost"
                aria-label="Corregir entrada"
                @click="abrirCorreccion(row.original)"
              />
            </UTooltip>
          </div>
        </template>
      </BaseTable>
    </template>

    <InventarioDialogoEntrada v-model="showEntrada" :producto-id="productoEntrada" @guardado="recargar" />
    <InventarioDialogoTraspaso v-model="showTraspaso" :producto-id="productoTraspaso" @guardado="recargar" />
    <InventarioDialogoAjuste
      v-model="showAjuste"
      :producto-id="productoAjuste"
      ubicacion="almacen"
      @guardado="recargar"
    />
    <InventarioTablaLotes v-model="showLotes" :producto="productoLotes" @guardado="recargar" />
    <InventarioDialogoCorreccionLote
      v-model="showCorreccion"
      :lote="loteCorreccion"
      @guardado="recargar"
    />
    <InventarioDialogoLote v-model="showDetalleLote" :lote="loteDetalle" />
    <InventarioDialogoVenta
      v-model="showVenta"
      :producto="productoVenta"
      ubicacion="almacen"
      :modo="modoVenta"

      @guardado="recargar"
    />

    <InventarioDialogoDesgloseStock
      v-model="showDesgloseStock"
      :producto-id="desgloseProductoId"
      ubicacion="almacen"
      :nombre-producto="desgloseNombre"
      :stock-total="desgloseStockTotal"
    />

    <BaseDialog
      v-model="showEstadoHistorico"
      title="Cambiar estado del lote"
      description="Clasifica el estado de este lote (defectuoso, liquidación, etc)."
      confirm-text="Guardar estado"
      :loading="guardandoEstadoHistorico"
      :disabled-guardar="!cambiaEstadoHistorico"
      @confirm="confirmarCambioEstadoHistorico"
      @cancel="showEstadoHistorico = false"
    >
      <div v-if="loteEstadoHistorico" class="space-y-3 text-sm">
        <div class="flex items-center justify-between rounded-md bg-elevated/50 px-3 py-2">
          <span>{{ loteEstadoHistorico.nombreProducto }}</span>
          <span class="font-mono text-xs text-muted">{{ loteEstadoHistorico.fechaEntrada }}</span>
        </div>
        <UFormField label="Estado">
          <USelectMenu
            v-model="nuevoEstadoHistorico"
            :items="estadosLoteHistorico"
            value-key="id"
            label-key="nombre"
            class="w-full"
          />
        </UFormField>
      </div>
    </BaseDialog>
  </BaseHeaderPage>
</template>

<script setup>
definePageMeta({
  middleware: ['jefe']
})

const {
  cargando, filas, lotesHistorialFiltrados,
  visibleHeaders, columnHeaders, visibleColumns,
  columnsHistorial,
  busquedaHistorial, filtroHistorial, incluirAnulados,
  colorEstado, textoEstado, abrirAjuste, abrirLotes, abrirCorreccion, abrirDetalleLote,
  recargar, sinMovimientos, hayProductos,
  showAjuste, showLotes, productoAjuste, productoLotes,
  showCorreccion, loteCorreccion, showDetalleLote, loteDetalle,
  abrirVenta, showVenta, modoVenta, productoVenta
} = useVistaInventario('almacen')

const perms = usePermisos()
const inv = useInventario()
const toast = useToast()

const showEstadoHistorico = ref(false)
const loteEstadoHistorico = ref(null)
const nuevoEstadoHistorico = ref('normal')
const guardandoEstadoHistorico = ref(false)

const estadosLoteHistorico = [
  { id: 'normal', nombre: 'Normal' },
  { id: 'liquidacion', nombre: 'Liquidación' },
  { id: 'defectuoso', nombre: 'Defectuoso' },
  { id: 'vencimiento_proximo', nombre: 'Vencimiento próximo' }
]

const cambiaEstadoHistorico = computed(() => {
  if (!loteEstadoHistorico.value) return false
  return nuevoEstadoHistorico.value !== (loteEstadoHistorico.value.estadoLote ?? 'normal')
})

const tab = ref('stock')
const tabs = [
  { label: 'Stock', value: 'stock' },
  { label: 'Historial de compras', value: 'historial' }
]

const filtrosHistorial = [
  { label: 'Todos los lotes', value: 'todos' },
  { label: 'Con stock', value: 'con-stock' },
  { label: 'Sin stock', value: 'sin-stock' }
]

const showEntrada = ref(false)
const showTraspaso = ref(false)
const productoEntrada = ref(null)
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

function abrirEntradaDe(productoId) {
  productoEntrada.value = productoId
  showEntrada.value = true
}

function abrirTraspasoDe(productoId) {
  productoTraspaso.value = productoId
  showTraspaso.value = true
}

function abrirCambioEstadoHistorico(lote) {
  loteEstadoHistorico.value = lote
  nuevoEstadoHistorico.value = (lote?.estadoLote ?? 'normal')
  showEstadoHistorico.value = true
}

async function confirmarCambioEstadoHistorico() {
  if (!loteEstadoHistorico.value || !cambiaEstadoHistorico.value) return
  guardandoEstadoHistorico.value = true
  try {
    await inv.cambiarEstadoLote(loteEstadoHistorico.value.id, nuevoEstadoHistorico.value)
    toast.add({ title: 'Estado de lote actualizado', color: 'success' })
    showEstadoHistorico.value = false
    await recargar()
  } catch (e) {
    toast.add({ title: 'No se pudo actualizar el estado', description: e?.message, color: 'error' })
  } finally {
    guardandoEstadoHistorico.value = false
  }
}
</script>
