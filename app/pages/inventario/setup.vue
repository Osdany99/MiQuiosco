<template>
  <BaseHeaderPage
    title="Conteo inicial"
    description="Registra lo que hay hoy en el almacén y reparte al quiosco"
    :show-button="false"
  >
    <div v-if="cargando" class="flex justify-center py-12">
      <UIcon name="i-lucide-loader-circle" class="animate-spin size-8 text-muted-foreground" />
    </div>

    <div v-else class="space-y-4">
      <div class="grid grid-cols-2 gap-2 max-w-xl">
        <UFormField label="Fecha del conteo">
          <UInput v-model="fecha" type="date" class="w-full" />
        </UFormField>
        <UFormField label="Proveedor / origen (opcional)">
          <USelectMenu
            v-model="proveedorId"
            :items="proveedores"
            value-key="id"
            label-key="nombre"
            placeholder="Sin proveedor..."
            class="w-full"
          />
        </UFormField>
      </div>

      <UTable :data="filas" :columns="columns" empty="Sin productos activos">
        <template #almacen-cell="{ row }">
          <BaseInputNumber
            v-model="row.original.cantidadAlmacen"
            :step="1"
            :min="0"
            class="w-24"
          />
        </template>
        <template #quiosco-cell="{ row }">
          <BaseInputNumber
            v-model="row.original.cantidadQuiosco"
            :step="1"
            :min="0"
            class="w-24"
          />
        </template>
        <template #precio-cell="{ row }">
          <BaseInputNumber v-model="row.original.precio" :min="0" class="w-28" />
        </template>
      </UTable>

      <div class="flex items-center justify-end gap-3">
        <p class="text-sm text-muted">
          {{ totalUnidades }} unidades · {{ fmtPrecio(valorTotal) }}
        </p>
        <UButton :loading="guardando" :disabled="!valido" @click="guardar">
          Guardar conteo inicial
        </UButton>
      </div>
    </div>
  </BaseHeaderPage>
</template>

<script setup>
definePageMeta({
  middleware: ['jefe']
})

const inv = useInventario()
const toast = useToast()

const cargando = ref(true)
const guardando = ref(false)
const fecha = ref(hoyLocal())
const proveedorId = ref(null)
const proveedores = ref([])
const filas = ref([])

const columns = [
  { accessorKey: 'nombre', header: 'Producto' },
  { accessorKey: 'almacen', header: 'En almacén' },
  { accessorKey: 'quiosco', header: 'Al quiosco' },
  { accessorKey: 'precio', header: 'P. compra' }
]

const valido = computed(() =>
  filas.value.some(f => Number(f.cantidadAlmacen) > 0 || Number(f.cantidadQuiosco) > 0)
  && filas.value.every(f =>
    (Number(f.cantidadAlmacen) || 0) + (Number(f.cantidadQuiosco) || 0) === 0
    || Number(f.precio) >= 0
  )
)

const totalUnidades = computed(() =>
  filas.value.reduce((s, f) => s + (Number(f.cantidadAlmacen) || 0) + (Number(f.cantidadQuiosco) || 0), 0)
)

const valorTotal = computed(() =>
  filas.value.reduce((s, f) => s + ((Number(f.cantidadAlmacen) || 0) + (Number(f.cantidadQuiosco) || 0)) * (Number(f.precio) || 0), 0)
)

onMounted(async () => {
  try {
    const [prods, provs] = await Promise.all([inv.cargarProductos(), inv.cargarProveedores()])
    proveedores.value = (provs ?? []).filter(p => p.activo !== false)
    filas.value = (prods ?? []).map(p => ({
      productoId: p.id,
      nombre: p.nombre,
      cantidadAlmacen: 0,
      cantidadQuiosco: 0,
      precio: Number(p.precioCompraActual) || 0
    }))
  } finally {
    cargando.value = false
  }
})

async function guardar() {
  guardando.value = true
  try {
    // 1. Todo entra al almacén como conteo inicial.
    const lineas = filas.value
      .filter(f => (Number(f.cantidadAlmacen) || 0) + (Number(f.cantidadQuiosco) || 0) > 0)
      .map(f => ({
        productoId: f.productoId,
        cantidad: (Number(f.cantidadAlmacen) || 0) + (Number(f.cantidadQuiosco) || 0),
        precioUnitario: Number(f.precio) || 0
      }))
    const entrada = await inv.registrarEntrada({
      fechaEntrada: fecha.value,
      proveedorId: proveedorId.value ?? null,
      lugarCompra: proveedorId.value ? null : 'Conteo inicial',
      detalleCompra: 'Conteo inicial',
      notas: 'Carga inicial de inventario',
      lineas
    })
    if (!entrada) throw new Error('No se pudo guardar la entrada.')

    // 2. Lo del quiosco se traspasa en la misma pasada.
    const alQuiosco = filas.value.filter(f => Number(f.cantidadQuiosco) > 0)
    if (alQuiosco.length > 0) {
      await inv.registrarTraspaso({
        fecha: fecha.value,
        notas: 'Distribución inicial al quiosco',
        lineas: alQuiosco.map(f => ({ productoId: f.productoId, cantidad: Math.trunc(Number(f.cantidadQuiosco)) }))
      })
    }
    toast.add({ title: 'Inventario inicial listo', description: 'Ya puedes ver los saldos en Inventario.', color: 'success' })
    await navigateTo('/inventario')
  } catch {
    // useInventario ya muestra el toast de error
  } finally {
    guardando.value = false
  }
}
</script>
