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
                @click="abrirAjusteDe(row.original)"
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

    <div class="flex justify-end mb-3">
      <UButton icon="i-lucide-mic" color="primary" variant="soft" size="sm" :loading="voiceRunning" @click="venderPorVoz">
        Vender por voz
      </UButton>
    </div>
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
      :prefill="voicePrefill"
      @guardado="recargar"
    />

    <BaseDialog
      v-model="showVoiceCandidates"
      title="Elegir producto"
      description="El reconocimiento no fue suficientemente claro. Confirma qué producto corresponde."
      hide-confirm
      @cancel="cancelarVoz"
    >
      <div class="space-y-2">
        <UButton
          v-for="candidate in voiceCandidates"
          :key="candidate.product.id"
          block
          variant="ghost"
          color="neutral"
          class="justify-start"
          @click="seleccionarCandidatoVoz(candidate)"
        >
          {{ candidate.row?.nombre ?? candidate.product.name }}
          <span class="ml-auto text-xs text-muted">{{ Math.round(candidate.score * 100) }}%</span>
        </UButton>
      </div>
    </BaseDialog>
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

const toast = useToast()
import { parseVoiceCommand } from '~/utils/voice/parseVoiceCommand'
import { fuzzyMatchProducts } from '~/utils/voice/fuzzyMatchProducts'
const voice = useVoiceCommand()

const showTraspaso = ref(false)
const productoTraspaso = ref(null)

// Solo un popover de venta abierto a la vez: guarda el id del producto cuyo
// menú está visible (null = ninguno).
const menuVentaId = ref(null)
const voiceRunning = ref(false)
const voicePrefill = ref(null)
const voiceCandidates = ref([])
const showVoiceCandidates = ref(false)
const pendingVoiceCommand = ref(null)

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

const VOICE_PRODUCT_THRESHOLD = 0.75

function abrirVentaPrefillPorVoz(fila, line) {
  const mappedModo = {
    regalo: 'regalo',
    casa: 'casa',
    familiar: 'familiar',
    directa: 'venta'
  }[line?.tipoVenta] || 'venta'

  voicePrefill.value = {
    modo: mappedModo,
    cantidad: Number(line?.cantidad) || 1,
    tipoVenta: line?.tipoVenta || 'directa',
    precioVentaUsado:
      line?.precioUnitario == null ? null : Number(line.precioUnitario),
    clienteHint: line?.clienteHint || null
  }
  abrirVenta(fila, mappedModo)
}

async function venderPorVoz() {
  voiceRunning.value = true
  voicePrefill.value = null
  voiceCandidates.value = []
  showVoiceCandidates.value = false
  pendingVoiceCommand.value = null
  try {
    await voice.startListening({ language: 'es-ES' })
    const text = voice.transcript.value
    if (!text) throw new Error('Sin transcript')

    const client = await import('#shared/schemas/voiceCommand')
    const validation = client.voiceCommandSchema.safeParse({
      ...parseVoiceCommand(text),
      estado: 'ready'
    })
    if (!validation.success) throw new Error('Comando de voz no valido')
    const line = validation.data.lines?.[0]
    if (!line) throw new Error('Sin linea de venta reconocida')

    const base = filas.value.map((f) => ({
      id: f.productoId,
      name: f.nombre,
      canonicalSpeak: f.nombre
    }))
    const candidates = fuzzyMatchProducts(line.productoHint, base)
      .map((candidate) => ({
        ...candidate,
        row: filas.value.find((f) => f.productoId === candidate.product.id)
      }))
      .filter((candidate) => candidate.row)

    if (!candidates.length) throw new Error('No encontre productos que coincidan')

    const best = candidates[0]
    if (best.score < VOICE_PRODUCT_THRESHOLD) {
      pendingVoiceCommand.value = line
      voiceCandidates.value = candidates
      showVoiceCandidates.value = true
      return
    }

    abrirVentaPrefillPorVoz(best.row, line)
  } catch (e) {
    toast.add({ title: 'Voz', description: e?.message || 'Error', color: 'error' })
  } finally {
    voiceRunning.value = false
  }
}

function seleccionarCandidatoVoz(candidate) {
  showVoiceCandidates.value = false
  const line = pendingVoiceCommand.value
  pendingVoiceCommand.value = null
  if (!candidate?.row || !line) return
  abrirVentaPrefillPorVoz(candidate.row, line)
}

function cancelarVoz() {
  showVoiceCandidates.value = false
  voiceCandidates.value = []
  pendingVoiceCommand.value = null
  voicePrefill.value = null
}

watch(showVenta, (open) => {
  if (!open) voicePrefill.value = null
})
</script>
