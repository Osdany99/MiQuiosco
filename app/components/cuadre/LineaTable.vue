<template>
  <div @scroll.capture="soltarFoco">
    <!-- Aviso general: el rojo del campo hay que ir a buscarlo, y en un día
         con muchos productos es fácil no llegar a todos. Va arriba de todo y
         cuenta los CAMPOS mal, que es lo que el jefe tiene que corregir. -->
    <div
      v-if="esJefe && excedentes.length"
      class="mb-3 flex items-start gap-2 rounded-md border border-error bg-error/10 px-3 py-2 text-sm text-error"
    >
      <UIcon name="i-lucide-triangle-alert" class="size-4 shrink-0 mt-0.5" />
      <p>
        <strong>{{ excedentes.length }} {{ excedentes.length === 1 ? 'campo tiene' : 'campos tienen' }}</strong>
        más unidades de las que había en el quiosco ({{ nombresExcedentes }}).
        <template v-if="!readonly">
          Corrige {{ excedentes.length === 1 ? 'esa cantidad' : 'esas cantidades' }} antes de cerrar el cuadre.
        </template>
      </p>
    </div>

    <BaseTable
      :data="lineas"
      :columns="columnDefs"
      :show-edit="false"
      :show-delete="false"
      :loading-prop="cargando"
      :pagination="false"
      :disable-filters="true"
      :show-reset="false"
    >
      <template #actions="{ row }">
        <UTooltip
          v-if="puedeFiar && !readonly"
          text="Fiar este producto"
          :delay-duration="0"
        >
          <UButton
            icon="i-lucide-hand-coins"
            size="sm"
            color="warning"
            variant="ghost"
            @click.stop="solicitarFiado(row.original)"
          />
        </UTooltip>
      </template>

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
          <!-- Subtítulo del producto: descripción (si tiene) y el precio que
               se cobra en ESTA línea — el de la duplicada si la hay. El precio
               no depende de que exista descripción: antes solo se veía en la
               columna "Precio venta" (oculta por defecto) y en una etiqueta
               amarilla que salía únicamente en las duplicadas. -->
          <div class="text-xs text-muted truncate max-w-44">
            <span v-if="getProductoDescripcion(row.original.productoId)">
              {{ getProductoDescripcion(row.original.productoId) }} ·
            </span>
            <span class="font-mono">{{ fmtPrecio(row.original.precioVentaUsado) }}</span>
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
            :model-value="row.original.cantidad"
            :step="1"
            class="w-20"
            :disabled="readonly"
            :readonly="bloqueado(row.original.id)"
            :increment="false"
            :decrement="false"
            :color="excesoDe(row.original) ? 'error' : undefined"
            :highlight="!!excesoDe(row.original)"
            @focus="(e) => activarEdicion(row.original, e)"
            @blur="terminarEdicion(row.original)"
            @update:model-value="(v) => alCambiarCantidad(row.original, v)"
          />
          <!-- El "Q:" es la CAPACIDAD del día (con qué merchandise había para
               vender), no el stock que queda: al cerrar el cuadre las ventas ya
               se descontaron y comparar contra el saldo salía en rojo sin razón.
               Tocar abre el desglose de dónde salió el número. -->
          <button
            v-if="capacidadDe(row.original.productoId)"
            type="button"
            class="block text-sm leading-tight mt-0.5 text-left"
            :class="excesoDe(row.original) ? 'text-error font-medium' : 'text-muted'"
            title="Ver de dónde sale este número"
            @click="abrirCapacidad(row.original)"
          >
            <span class="block">Q: {{ capacidadDe(row.original.productoId).capacidad }}</span>
            <span v-if="excesoDe(row.original)" class="block text-xs">
              quedarían −{{ excesoDe(row.original).exceso }}
            </span>
          </button>
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

    <CuadreDialogoCapacidad
      v-model="capacidadOpen"
      :datos="capacidadActual"
      :producto="productoCapacidad"
      :vendido="vendidoActual"
    />
  </div>
</template>

<script setup>
const emit = defineEmits(['fiar'])

const {
  lineas, expandida, cargando, capacidadPorProducto, excedentes, vendidoDe, fiadoDeProducto,
  recalcularSubtotal, toggleExpandir,
  getProductoNombre, getProductoDescripcion,
  flushAutosave, duplicarLinea, eliminarLinea
} = useCuadre()

const toast = useToast()

const eliminarOpen = ref(false)
const aEliminar = ref(null)

const capacidadOpen = ref(false)
const productoCapacidad = ref(null)

// La capacidad es solo ayuda visual (y solo para el jefe: el trabajador no ve
// costos ni stock). No bloquea la venta; el descuento real pasa al cerrar.
const { esJefe } = useAuth()

/** Datos de capacidad del producto, o null si el jefe no ve stock. */
function capacidadDe(productoId) {
  if (!esJefe.value) return null
  return capacidadPorProducto.value?.get(productoId) ?? null
}

/**
 * El exceso de ESTA línea, o null si no se pasa. Sale de `excedentes` para que
 * el rojo del campo, la banda de arriba y el bloqueo del cierre comparen
 * siempre contra los mismos números (la suma de las líneas del producto).
 */
function excesoDe(linea) {
  return excedentes.value.find(e => e.lineaId === linea.id) ?? null
}

/** Nombres de los productos con cantidades mal, para la banda de arriba. */
const nombresExcedentes = computed(() => {
  const nombres = []
  for (const e of excedentes.value) {
    const nombre = getProductoNombre(e.productoId)
    if (!nombres.includes(nombre)) nombres.push(nombre)
  }
  if (nombres.length <= 4) return nombres.join(', ')
  return `${nombres.slice(0, 4).join(', ')} y ${nombres.length - 4} más`
})

function abrirCapacidad(linea) {
  productoCapacidad.value = { id: linea.productoId, nombre: getProductoNombre(linea.productoId) }
  capacidadOpen.value = true
}

// El diálogo recibe el desglose del producto abierto. Se deriva del mapa y no
// se guarda aparte: si el cuadre se recarga, el diálogo no puede quedarse
// enseñando el número de un producto que ya no es el que está en pantalla.
const capacidadActual = computed(() =>
  productoCapacidad.value
    ? capacidadDe(productoCapacidad.value.id)
    : null
)

// El vendido se deriva igual, y con TODAS las líneas del producto: es lo que
// falta por restar a la capacidad para saber cuánto queda en el quiosco.
const vendidoActual = computed(() =>
  productoCapacidad.value ? vendidoDe(productoCapacidad.value.id) : 0
)

function duplicar(linea) {
  duplicarLinea(linea)
}

/**
 * No se puede vender menos de lo que ya está fiado de ese producto. Bajar la
 * línea dejaría al cuadre debiendo unidades que él ya no cuenta como vendidas,
 * y el tope "fiado ≤ vendido" se rompería en silencio: el cuadre cerraría con
 * una deuda por algo que nunca se vendió. La salida es borrar la deuda, no
 * maquillar la venta.
 */
function alCambiarCantidad(linea, valor) {
  const minimo = fiadoDeProducto(linea.productoId)
  const n = Number(valor) || 0
  if (n < minimo) {
    toast.add({
      title: 'No puedes vender menos de lo ya fiado',
      description: `Ya fiaraste ${minimo} de ${getProductoNombre(linea.productoId)}. Borra esa deuda desde "Fiado del día" antes de bajar la cantidad.`,
      color: 'error'
    })
    return
  }
  linea.cantidad = n
  recalcularSubtotal(linea)
}

/**
 * Quitar una línea baja el vendido de ese producto, así que abre el mismo
 * agujero que bajar la cantidad a mano: si queda menos vendido de lo que está
 * fiado, la deuda se queda apuntando a unidades que ya no constan.
 */
function confirmarEliminar() {
  const linea = aEliminar.value
  aEliminar.value = null
  eliminarOpen.value = false
  if (!linea) return
  const minimo = fiadoDeProducto(linea.productoId)
  const restante = vendidoDe(linea.productoId) - (Number(linea.cantidad) || 0)
  if (restante < minimo) {
    toast.add({
      title: 'No puedes quitar una línea con fiado',
      description: `De ${getProductoNombre(linea.productoId)} ya fiaraste ${minimo} y al quitar esta línea solo quedarían ${restante} unidades vendidas. Borra esa deuda desde "Fiado del día" primero.`,
      color: 'error'
    })
    return
  }
  eliminarLinea(linea.id)
}

defineProps({
  readonly: { type: Boolean, default: false },
  /**
   * Solo el jefe fía. La tabla no lo sabe: lo dice la página, que ya oculta
   * la tarjeta de fiado, el formulario de cierre y el stock para el trabajador.
   */
  puedeFiar: { type: Boolean, default: false }
})

/** Pide declarar deuda sobre la línea. El diálogo lo abre la tarjeta de fiado. */
function solicitarFiado(linea) {
  emit('fiar', linea)
}

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

function terminarEdicion(linea) {
  if (reEnfocando) return
  editandoId.value = null
  // Al salir del campo ya no hay nada que seguir editando: se guarda de
  // inmediato en vez de esperar al debounce.
  flushAutosave()
  // Aviso al soltar el campo, no mientras se teclea: a media palabra la
  // cantidad todavía está en camino y un toast por tecla sería insoportable.
  // El número NO se corrige solo — la capacidad puede estar mal registrada y
  // lo que escribió el jefe es el dato real; lo que hace es dejarlo en rojo
  // e impedir cerrar el cuadre hasta que lo revise.
  const exceso = linea ? excesoDe(linea) : null
  if (exceso) {
    toast.add({
      title: 'Cantidad mayor que lo disponible',
      description: `${getProductoNombre(linea.productoId)} — escribiste ${exceso.vendido} y en el quiosco había ${exceso.capacidad}.`,
      color: 'error'
    })
  }
}

function soltarFoco() {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
}

// Subtotal oculto por defecto: el total del día ya está en el resumen de la
// derecha y por línea solo estorba en el móvil. Sigue a un toque desde el
// selector de columnas de la barra. La columna de acciones se declara aquí
// (no la añade BaseTable) porque esta tabla va sin edit/delete.
const columnDefs = [
  { id: 'producto', header: 'Producto' },
  { accessorKey: 'precioVentaUsado', header: 'Precio venta', visible: false },
  { accessorKey: 'cantidad', header: 'Cant. V' },
  { accessorKey: 'subtotal', header: 'Subtotal', cell: 'currency', visible: false },
  { id: 'action', header: 'Acciones' }
]
</script>
