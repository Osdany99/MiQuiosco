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
                  <USeparator class="my-1" />
                  <UButton
                    block
                    variant="ghost"
                    color="neutral"
                    icon="i-lucide-house"
                    label="Venta casa (al costo)"
                    class="justify-start"
                    @click="vender(row.original, 'casa')"
                  />
                  <UButton
                    block
                    variant="ghost"
                    color="neutral"
                    icon="i-lucide-users"
                    label="Venta familiar"
                    class="justify-start"
                    @click="vender(row.original, 'familiar')"
                  />
                  <UButton
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
      <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div class="flex flex-wrap items-center gap-2">
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
        </div>
        <TableToolbar
          v-model:visible-headers="visibleHeadersHistorial"
          :column-headers="columnHeadersHistorial"
        />
      </div>

      <UTable
        :data="lotesHistorialFiltrados"
        :columns="visibleColumnsHistorial"
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
      </UTable>
    </template>

    <InventarioDialogoEntrada v-model="showEntrada" :producto-id="productoEntrada" @guardado="recargar" />
    <div class="flex justify-end mb-3">
      <UButton icon="i-lucide-mic" color="primary" variant="soft" size="sm" :loading="voiceRunning" @click="venderPorVoz">
        Vender por voz
      </UButton>
    </div>
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
      :prefill="voicePrefill"
      @guardado="recargar"
    />
  </BaseHeaderPage>
</template>

<script setup>
definePageMeta({
  middleware: ['jefe']
})

const {
  cargando, filas, lotesHistorialFiltrados,
  visibleHeaders, columnHeaders, visibleColumns,
  visibleHeadersHistorial, columnHeadersHistorial, visibleColumnsHistorial,
  busquedaHistorial, filtroHistorial, incluirAnulados,
  colorEstado, textoEstado, abrirAjuste, abrirLotes, abrirCorreccion, abrirDetalleLote,
  recargar, sinMovimientos, hayProductos,
  showAjuste, showLotes, productoAjuste, productoLotes,
  showCorreccion, loteCorreccion, showDetalleLote, loteDetalle,
  abrirVenta, showVenta, modoVenta, productoVenta
} = useVistaInventario('almacen')

const toast = useToast()
import { parseVoiceCommand } from '~/utils/voice/parseVoiceCommand'
import { fuzzyMatchProducts } from '~/utils/voice/fuzzyMatchProducts'
const voice = useVoiceCommand()
const voiceRunning = ref(false)
const voicePrefill = ref(null)

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
function venderPorVoz() {
  voiceRunning.value = true
  voicePrefill.value = null
  try {
    voice.startListening({ language: 'es-ES' }).then(async () => {
      const text = voice.transcript.value
      if (!text) throw new Error('Sin transcript')
      const parsed = parseVoiceCommand(text)
      const base = filas.value.map((f) => ({ id: f.productoId, name: f.nombre, canonicalSpeak: f.nombre }))
      const opts = fuzzyMatchProducts(parsed.lines[0].productoHint, base)
      const best = opts && opts[0]
      const row = (best && filas.value.find((f) => f.productoId === best.product.id)) || filas.value[0]
      if (!row) throw new Error('Sin fil as de inventario')
      const mappedModo = { regalo: "regalo", casa: "casa", familiar: "familiar", directa: "venta" }[parsed.lines[0].tipoVenta] || "venta"
      voicePrefill.value = {
        modo: mappedModo,
        cantidad: parsed.lines[0].cantidad,
        tipoVenta: parsed.lines[0].tipoVenta,
        precioVentaUsado:
          parsed.lines[0].precioUnitario == null ? null : Number(parsed.lines[0].precioVentaUsado ?? parsed.lines[0].precioUnitario),
        clienteHint: parsed.lines[0].clienteHint || null
      }
      abrirVenta(row, mappedModo)
    }).catch((e) => {
      toast.add({ title: "Voz", description: e?.message || "Error", color: "error" })
    }).finally(() => (voiceRunning.value = false))
  } catch (e) {
    toast.add({ title: "Voz", description: e?.message || "Error", color: "error" })
    voiceRunning.value = false
  }
}
</script>
