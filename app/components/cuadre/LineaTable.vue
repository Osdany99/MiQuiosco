<template>
  <div @scroll.capture="soltarFoco">
    <BaseTable
      :data="lineas"
      :columns="columnDefs"
      :show-edit="false"
      :show-delete="false"
      :loading-prop="cargando"
      :pagination="false"
      :disable-filters="true"
      @reload="reload"
    >
      <template #producto-cell="{ row }">
        <div>
          <!-- Columna estrecha a propósito: en el móvil tiene que caber
               Producto + Cantidad sin scroll horizontal, porque la cantidad
               es lo que se teclea docenas de veces al día. -->
          <div class="flex items-center gap-1">
            <!-- Tocar el nombre despliega la nota: un chevron más solo
                 ensanchaba la columna. -->
            <button
              type="button"
              class="font-medium truncate max-w-28 text-left cursor-pointer"
              title="Tocar para ver la nota"
              @click="toggleExpandir(row.original.id)"
            >
              {{ getProductoNombre(row.original.productoId) }}
            </button>
            <UButton
              v-if="row.original.esExtra"
              color="warning"
              size="xs"
              class="font-mono"
              :label="`${fmtPrecio(row.original.precioVentaUsado)}`"
            />
            <!-- Solo las líneas de catálogo se duplican: duplicar una
                 duplicada solo crearía cadenas de copias sin sentido. -->
            <UButton
              v-if="!readonly && !row.original.esExtra"
              icon="i-lucide-copy"
              variant="ghost"
              size="xs"
              title="Duplicar línea (otro precio)"
              @click.stop="duplicar(row.original)"
            />
            <UButton
              v-if="!readonly && row.original.esExtra"
              icon="i-lucide-trash-2"
              variant="ghost"
              color="error"
              size="xs"
              title="Quitar esta línea"
              @click.stop="aEliminar = row.original; eliminarOpen = true"
            />
          </div>
          <!-- Descripción del producto como subtítulo. Solo si tiene: vive
               dentro del ancho de la columna, igual que la nota. -->
          <div
            v-if="getProductoDescripcion(row.original.productoId)"
            class="text-xs text-muted truncate max-w-44"
          >
            {{ getProductoDescripcion(row.original.productoId) }}
          </div>
          <!-- La nota vive dentro del ancho de la columna, no la estira.
               Textarea con autoresize: una nota corta ocupa 1 línea (igual que
               un input) y una "un poco larga" crece y se lee completa con wrap,
               en vez de desbordarse a la derecha donde no se puede leer. -->
          <div v-if="expandida.has(row.original.id)" class="mt-1">
            <UTextarea
              v-model="row.original.nota"
              placeholder="Nota (opcional)"
              :rows="1"
              autoresize
              :maxrows="4"
              :maxlength="200"
              size="sm"
              class="w-full max-w-44"
              :disabled="readonly"
            />
          </div>
        </div>
      </template>

      <template #precioVentaUsado-cell="{ row }">
        <BaseInputNumber
          v-model="row.original.precioVentaUsado"
          class="w-28"
          :disabled="readonly || !row.original.esExtra"
          :readonly="bloqueado(row.original.id)"
          :increment="false"
          :decrement="false"
          @focus="(e) => activarEdicion(row.original, e)"
          @blur="terminarEdicion"
          @update:model-value="recalcularSubtotal(row.original)"
        />
      </template>

      <template #cantidad-cell="{ row }">
        <div>
          <BaseInputNumber
            v-model="row.original.cantidad"
            :step="1"
            class="w-20"
            :disabled="readonly"
            :readonly="bloqueado(row.original.id)"
            :increment="false"
            :decrement="false"
            @focus="(e) => activarEdicion(row.original, e)"
            @blur="terminarEdicion"
            @update:model-value="recalcularSubtotal(row.original)"
          />
          <div
            v-if="stockQuiosco.has(row.original.productoId)"
            class="text-[11px] leading-tight mt-0.5"
            :class="Number(row.original.cantidad) > (stockQuiosco.get(row.original.productoId) ?? 0) ? 'text-error font-medium' : 'text-muted'"
          >
            Q: {{ stockQuiosco.get(row.original.productoId) }}
          </div>
        </div>
      </template>
    </BaseTable>

    <BaseDialog
      v-model="eliminarOpen"
      title="Quitar línea"
      confirm-text="Quitar"
      confirm-color="error"
      @confirm="confirmarEliminar"
      @cancel="eliminarOpen = false"
    >
      <p class="text-sm">
        Se quitará la línea de <strong>{{ aEliminar ? getProductoNombre(aEliminar.productoId) : '' }}</strong>
        a {{ aEliminar ? fmtPrecio(aEliminar.precioVentaUsado) : '' }}.
      </p>
    </BaseDialog>
  </div>
</template>

<script setup>
const emit = defineEmits(['reload'])

const {
  lineas, expandida, cargando,
  recalcularSubtotal, toggleExpandir,
  getProductoNombre, getProductoDescripcion,
  flushAutosave, duplicarLinea, eliminarLinea
} = useCuadre()

const eliminarOpen = ref(false)
const aEliminar = ref(null)

// Stock del quiosco como ayuda visual (solo jefe: el trabajador no ve costos
// ni stock). No bloquea la venta; el descuento real pasa al cerrar.
const stockQuiosco = ref(new Map())
const { esJefe } = useAuth()

onMounted(async () => {
  if (!esJefe.value) return
  try {
    const saldos = await useInventario().cargarSaldos()
    stockQuiosco.value = new Map((saldos ?? []).map(s => [s.productoId, s.quiosco]))
  } catch {
    // Sin saldos no hay hint; la venta sigue funcionando igual.
  }
})

function duplicar(linea) {
  duplicarLinea(linea)
}

function confirmarEliminar() {
  if (aEliminar.value) eliminarLinea(aEliminar.value.id)
  aEliminar.value = null
  eliminarOpen.value = false
}

defineProps({
  readonly: { type: Boolean, default: false }
})

// Edición por toque: en móvil los campos viven bloqueados para que el
// scroll nunca los altere; solo se desbloquea la fila tocada explícitamente.
// Al perder foco (o al desplazar) vuelve a bloquearse.
const editandoId = ref(null)
let reEnfocando = false

function bloqueado(id) {
  return editandoId.value !== id
}

function activarEdicion(linea, e) {
  if (editandoId.value === linea.id) return
  editandoId.value = linea.id
  // Reenfocar para que el teclado aparezca (el foco inicial cayó en readonly)
  const el = e?.target?.tagName === 'INPUT' ? e.target : null
  if (el) {
    reEnfocando = true
    el.blur()
    nextTick(() => {
      el.focus()
      reEnfocando = false
    })
  }
}

function terminarEdicion() {
  if (reEnfocando) return
  editandoId.value = null
  // Al salir del campo ya no hay nada que seguir editando: se guarda de
  // inmediato en vez de esperar al debounce.
  flushAutosave()
}

function soltarFoco() {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
}

const columnDefs = [
  { id: 'producto', header: 'Producto' },
  { accessorKey: 'precioVentaUsado', header: 'Precio venta', visible: false },
  { accessorKey: 'cantidad', header: 'Cant.' },
  { accessorKey: 'subtotal', header: 'Subtotal', cell: 'currency' }
]

function reload() {
  emit('reload')
}
</script>
