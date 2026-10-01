<template>
  <BaseHeaderPage
    title="Inventario"
    description="Stock del quiosco y del almacén"
    title-button="Nueva entrada"
    @new="showEntrada = true"
  >
    <template #trailing>
      <UButton icon="i-lucide-arrow-right-left" variant="outline" @click="abrirTraspaso()">
        Traspasar
      </UButton>
      <UButton icon="i-lucide-truck" variant="outline" @click="showProveedores = true">
        Proveedores
      </UButton>
    </template>

    <UTabs v-model="tab" :items="tabs" class="mb-4" />

    <div v-if="cargando" class="flex justify-center py-12">
      <UIcon name="i-lucide-loader-circle" class="animate-spin size-8 text-muted-foreground" />
    </div>

    <UTable
      v-else-if="tab === 'quiosco' || tab === 'almacen'"
      :data="filas"
      :columns="columnsUbicacion"
      empty="Sin productos"
    >
      <template #estado-cell="{ row }">
        <UBadge :color="colorEstado(row.original)" variant="soft">
          {{ textoEstado(row.original) }}
        </UBadge>
      </template>
      <template #acciones-cell="{ row }">
        <div class="flex gap-1 justify-end">
          <UTooltip text="Reponer desde almacén" :delay-duration="0">
            <UButton
              icon="i-lucide-arrow-right-left"
              size="xs"
              color="neutral"
              variant="ghost"
              @click="abrirTraspaso(row.original.productoId)"
            />
          </UTooltip>
          <UTooltip text="Merma / devolución" :delay-duration="0">
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

const inv = useInventario()

const tab = ref('quiosco')
const tabs = [
  { label: 'Quiosco', value: 'quiosco' },
  { label: 'Almacén', value: 'almacen' },
  { label: 'Historial', value: 'historial' }
]

const cargando = ref(true)
const saldos = ref([])
const lotesHistorial = ref([])

const showEntrada = ref(false)
const showTraspaso = ref(false)
const showAjuste = ref(false)
const showLotes = ref(false)
const showProveedores = ref(false)
const preseleccion = ref([])
const productoAjuste = ref(null)
const productoLotes = ref(null)

const esQuiosco = computed(() => tab.value === 'quiosco')

const columnsUbicacion = computed(() => [
  { accessorKey: 'nombre', header: 'Producto' },
  { accessorKey: esQuiosco.value ? 'quiosco' : 'almacen', header: 'Stock' },
  { accessorKey: esQuiosco.value ? 'stockMinimoQuiosco' : 'stockMinimoAlmacen', header: 'Mín' },
  ...(esQuiosco.value ? [{ accessorKey: 'stockRecomendadoQuiosco', header: 'Recomendado' }] : []),
  { accessorKey: 'costoActual', header: 'Costo' },
  { accessorKey: esQuiosco.value ? 'valorizadoQuiosco' : 'valorizadoAlmacen', header: 'Valorizado' },
  { accessorKey: 'estado', header: 'Estado' },
  { accessorKey: 'acciones', header: '' }
])

const columnsHistorial = [
  { accessorKey: 'fechaEntrada', header: 'Fecha' },
  { accessorKey: 'nombreProducto', header: 'Producto' },
  { accessorKey: 'cantidadInicial', header: 'Cant.' },
  { accessorKey: 'precioUnitario', header: 'P. compra' },
  { accessorKey: 'valor', header: 'Valor' },
  { accessorKey: 'origen', header: 'Origen' },
  { accessorKey: 'detalleCompra', header: 'Detalle' }
]

const filas = computed(() => saldos.value)

function stockDe(fila) {
  return esQuiosco.value ? fila.quiosco : fila.almacen
}

function minimoDe(fila) {
  return esQuiosco.value ? fila.stockMinimoQuiosco : fila.stockMinimoAlmacen
}

function colorEstado(fila) {
  const s = stockDe(fila)
  if (s < minimoDe(fila)) return 'error'
  if (esQuiosco.value && s < fila.stockRecomendadoQuiosco) return 'warning'
  return 'success'
}

function textoEstado(fila) {
  const s = stockDe(fila)
  if (s < minimoDe(fila)) return 'Bajo mínimo'
  if (esQuiosco.value && s < fila.stockRecomendadoQuiosco) return 'Reponer'
  return 'OK'
}

function abrirTraspaso(productoId = null) {
  preseleccion.value = productoId ? [{ productoId, cantidad: 0 }] : []
  showTraspaso.value = true
}

function abrirAjuste(productoId) {
  productoAjuste.value = productoId
  showAjuste.value = true
}

function abrirLotes(fila) {
  productoLotes.value = { id: fila.productoId, nombre: fila.nombre }
  showLotes.value = true
}

async function recargar() {
  cargando.value = true
  try {
    saldos.value = await inv.cargarSaldos() ?? []
    const [lotesRows, prods] = await Promise.all([
      inv.cargarLotes().catch(() => []),
      inv.cargarProductos().catch(() => [])
    ])
    const provs = await inv.cargarProveedores().catch(() => [])
    const nombreProd = new Map((prods ?? []).map(p => [p.id, p.nombre]))
    const nombreProv = new Map((provs ?? []).map(p => [p.id, p.nombre]))
    lotesHistorial.value = (lotesRows ?? [])
      .slice()
      .sort((a, b) => String(b.fechaEntrada ?? '').localeCompare(String(a.fechaEntrada ?? '')))
      .map(l => ({
        ...l,
        nombreProducto: nombreProd.get(l.productoId) ?? '—',
        origen: l.proveedorId ? (nombreProv.get(l.proveedorId) ?? '—') : (l.lugarCompra || '—')
      }))
  } finally {
    cargando.value = false
  }
}

onMounted(recargar)
</script>
