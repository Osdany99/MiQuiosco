<script setup>
import Sortable from 'sortablejs'
import { productoSchema } from '../../shared/schemas/producto'
import { productos as config } from '../../shared/tables'

definePageMeta({
  middleware: ['jefe']
})

const fields = [
  { name: 'nombre', label: 'Nombre', type: 'text', required: true, placeholder: 'Nombre del producto', colSpan: 'sm:col-span-2', props: { class: 'w-full', maxlength: 100 } },
  { name: 'descripcion', label: 'Descripción', type: 'text', required: false, placeholder: 'Descripción opcional', colSpan: 'sm:col-span-2', props: { class: 'w-full' } },
  { name: 'precioCompraActual', label: 'Precio compra', type: 'number', required: true, props: { class: 'w-full', min: 0, step: 100 } },
  { name: 'precioVentaActual', label: 'Precio venta', type: 'number', required: true, props: { class: 'w-full', min: 0, step: 100 } },
  { name: 'activo', label: 'Activo', type: 'switch', required: true, colSpan: 'sm:col-span-2', props: { uncheckedIcon: 'i-lucide-x', checkedIcon: 'i-lucide-check', class: 'w-full' } }
]

const columns = [
  { id: 'drag', header: '' },
  { accessorKey: 'id', header: 'ID', visible: false },
  { accessorKey: 'nombre', header: 'Producto' },
  { accessorKey: 'descripcion', header: 'Descripción', visible: false },
  // Solo lectura y oculta: sirve para verificar el orden real tras un
  // arrastre. El orden no se edita a mano (el drag es la única vía).
  { accessorKey: 'orden', header: 'Orden', visible: false },
  { accessorKey: 'precioCompraActual', header: 'Precio Compra', cell: 'currency' },
  { accessorKey: 'precioVentaActual', header: 'Precio Venta', cell: 'currency' },
  { accessorKey: 'activo', header: 'Estado', cell: 'activation' },
  { accessorKey: 'action', header: 'Acciones' }
]

const tableRef = ref(null)
const formRef = ref(null)
const form = ref({ id: null, nombre: '', descripcion: '', precioCompraActual: 0, precioVentaActual: 0, orden: 0, activo: true })

const showHistorial = ref(false)
const historialProducto = ref(null)

const { patch } = useRepo(config)
const reordenando = ref(false)
let sortable = null

function filas() {
  return toValue(tableRef.value?.data) ?? []
}

function maxOrden() {
  return filas().reduce((m, r) => Math.max(m, Number(r.orden ?? 0)), 0)
}

// Al crear, el producto va al final (el orden visible ya no se edita a mano)
function nuevoProducto() {
  tableRef.value?.openAdd()
  form.value.orden = maxOrden() + 1
}

function tbodyEl() {
  return tableRef.value?.$el?.querySelector('tbody') ?? null
}

function initSortable() {
  destruirSortable()
  const tbody = tbodyEl()
  if (!tbody) return
  sortable = new Sortable(tbody, {
    handle: '.drag-handle',
    animation: 150,
    // En táctil exige pulsación larga: el scroll vertical sigue funcionando
    delay: 200,
    delayOnTouchOnly: true,
    touchStartThreshold: 5,
    scrollSensitivity: 60,
    // Solo vertical: en móvil el arrastre diagonal saltaba filas de más.
    direction: 'vertical',
    ghostClass: 'opacity-40',
    onEnd: reordenar
  })
}

function destruirSortable() {
  sortable?.destroy()
  sortable = null
}

// Mueve un elemento del arreglo y renumera 1..n. Se trabaja sobre los DATOS
// (que ya vienen ordenados por 'orden') en vez de sobre el DOM: leer el DOM
// después del arrastre era lo que fallaba en táctil, porque Sortable puede
// dejar la fila una posición más abajo de donde el dedo apuntaba y eso se
// guardaba tal cual.
function mover(ids, from, to) {
  const arr = [...ids]
  const [movido] = arr.splice(from, 1)
  arr.splice(to, 0, movido)
  return arr.map((id, i) => ({ id, orden: i + 1 }))
}

// Sortable mueve la fila en el DOM por su cuenta (optimista) antes de que
// sepamos si el guardado funcionó. Se devuelve la fila a su posición original
// para que la pantalla nunca muestre un orden que no esté guardado.
function revertirFila(tbody, item, oldIndex) {
  if (!item || oldIndex == null) return
  // La posición se mide sobre las filas SIN la arrastrada: si no, al devolver
  // una fila que venía de abajo el índice contaría dos veces y aterrizaría una
  // posición más arriba de la original.
  const otras = [...tbody.children].filter(el => el !== item)
  const referencia = otras[oldIndex] ?? null
  tbody.insertBefore(item, referencia)
}

async function reordenar(evt) {
  if (reordenando.value) return
  const from = evt?.oldIndex
  const to = evt?.newIndex
  if (from == null || to == null || from === to) return
  const tbody = tbodyEl()
  if (!tbody) return

  const actuales = filas().map(r => String(r.id))
  if (from < 0 || from >= actuales.length || to < 0 || to >= actuales.length) return

  // Primero se suelta Sortable: si sigue vivo, insertBefore se pelea con él.
  destruirSortable()
  revertirFila(tbody, evt?.item, from)

  const objetivo = mover(actuales, from, to)
  const porId = new Map(filas().map(r => [String(r.id), r]))
  reordenando.value = true
  try {
    // useRepo.patch devuelve { data, error }: hay que inspeccionar cada
    // resultado porque Promise.all no rechaza (los errores van en error).
    const resultados = await Promise.all(objetivo.map(({ id, orden }) => {
      const row = porId.get(id)
      if (!row || Number(row.orden) === orden) return null
      return patch(row.id, { orden })
    }))
    const fallos = resultados.filter(r => r && r.error).length
    if (fallos > 0) {
      useToast().add({
        title: 'No se pudo guardar el orden',
        description: `Fallaron ${fallos} producto(s). Reintenta el arrastre.`,
        color: 'error'
      })
    }
  } finally {
    reordenando.value = false
    // El refetch trae los productos ya ordenados por 'orden'. Await real
    // (Table.refresh devuelve la promesa) + un tick para que Vue pinte, y solo
    // después se engancha Sortable sobre el DOM definitivo.
    await tableRef.value?.refresh()
    await nextTick()
    initSortable()
  }
}

onMounted(() => {
  nextTick(() => initSortable())
  // Reintento por si la tabla aún no pintó el tbody
  setTimeout(() => {
    if (!sortable) initSortable()
  }, 1500)
})

onBeforeUnmount(() => destruirSortable())
</script>

<template>
  <BaseHeaderPage
    :title="config.label.plural"
    description="Catálogo de productos del puesto"
    :title-button="'Nuevo ' + config.label.singular"
    @new="nuevoProducto"
  >
    <BaseTable
      ref="tableRef"
      v-model="form"
      :config="config"
      :columns="columns"
      :form-ref="formRef"
      :pagination="false"
      :query="{ orderBy: 'orden', orderDir: 'asc' }"
    >
      <template #form>
        <BaseForm
          ref="formRef"
          v-model="form"
          :fields="fields"
          :schema="productoSchema"
        />
      </template>

      <template #drag-cell="{ row }">
        <span
          class="drag-handle inline-flex cursor-grab active:cursor-grabbing text-gray-400 touch-none select-none px-1"
          :data-id="row.original.id"
          title="Arrastrar para reordenar"
        >
          <UIcon name="i-lucide-grip-vertical" class="w-5 h-5" />
        </span>
      </template>

      <template #row-actions-extra="{ rowData }">
        <UTooltip text="Ver historial de precios" :delay-duration="0">
          <UButton
            icon="i-lucide-clock"
            size="sm"
            color="neutral"
            variant="ghost"
            @click="historialProducto = rowData; showHistorial = true"
          />
        </UTooltip>
      </template>
    </BaseTable>
    <ProductoHistorialPrecios v-model="showHistorial" :producto="historialProducto" />
  </BaseHeaderPage>
</template>
