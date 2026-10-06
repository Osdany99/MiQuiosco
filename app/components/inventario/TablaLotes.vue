<template>
  <BaseDialog
    v-model="isOpen"
    :title="`Lotes - ${producto?.nombre}`"
    description="Cada lote conserva su precio de compra. Solo se corrige el precio de un lote sin consumo."
    cancel-text="Cerrar"
    :hide-confirm="true"
    @cancel="isOpen = false"
  >
    <div v-if="cargando" class="flex justify-center py-8">
      <UIcon name="i-lucide-loader-circle" class="animate-spin size-8 text-muted-foreground" />
    </div>
    <p
      v-else-if="producto?.descripcion?.trim()"
      class="text-xs text-muted truncate mb-2"
    >
      {{ producto.descripcion }}
    </p>
    <UTable
      v-else
      :data="lotes"
      :columns="columns"
      empty="Sin lotes registrados"
    >
      <template #fechaEntrada-cell="{ row }">
        {{ row.original.fechaEntrada }}
      </template>
      <template #precioUnitario-cell="{ row }">
        {{ fmtPrecio(row.original.precioUnitario) }}
      </template>
      <template #saldo-cell="{ row }">
        Alm: {{ row.original.saldoAlmacen }} · Quiosco: {{ row.original.saldoQuiosco }}
      </template>
      <template #proveedor-cell="{ row }">
        {{ nombreProveedor(row.original) }}
      </template>
      <template #acciones-cell="{ row }">
        <UButton
          v-if="!row.original.conConsumo && !row.original.anulado"
          icon="i-lucide-pencil"
          size="xs"
          color="neutral"
          variant="ghost"
          title="Corregir precio"
          @click="abrirCorreccion(row.original)"
        />
      </template>
    </UTable>

    <div v-if="corrigiendo" class="mt-4 border-t pt-4 space-y-3">
      <p class="text-sm font-medium">
        Corregir precio del lote del {{ corrigiendo.fechaEntrada }} (actual: {{ fmtPrecio(corrigiendo.precioUnitario) }})
      </p>
      <div class="flex gap-2 items-end">
        <UFormField label="Precio correcto" class="w-32">
          <BaseInputNumber v-model="precioNuevo" :min="0" />
        </UFormField>
        <UFormField label="Motivo" class="flex-1">
          <UInput v-model="motivo" placeholder="Error al registrar..." class="w-full" />
        </UFormField>
        <UButton
          size="sm"
          :loading="guardando"
          :disabled="!(motivo.trim())"
          @click="confirmarCorreccion"
        >
          Guardar
        </UButton>
      </div>
    </div>
  </BaseDialog>
</template>

<script setup>
const props = defineProps({
  producto: { type: Object, default: null }
})
const isOpen = defineModel({ type: Boolean, default: false })
const emit = defineEmits(['guardado'])

const inv = useInventario()
const toast = useToast()

const lotes = ref([])
const cargando = ref(false)
const corrigiendo = ref(null)
const precioNuevo = ref(0)
const motivo = ref('')
const guardando = ref(false)

const columns = [
  { accessorKey: 'fechaEntrada', header: 'Entrada' },
  { accessorKey: 'cantidadInicial', header: 'Cant.' },
  { accessorKey: 'precioUnitario', header: 'P. compra' },
  { accessorKey: 'saldo', header: 'Saldo' },
  { accessorKey: 'proveedor', header: 'Proveedor' },
  { accessorKey: 'acciones', header: '' }
]

function nombreProveedor(lote) {
  if (lote.nombreProveedor) return lote.nombreProveedor
  return lote.lugarCompra || '—'
}

watch(isOpen, async (open) => {
  if (!open || !props.producto?.id) return
  corrigiendo.value = null
  await recargar()
})

async function recargar() {
  cargando.value = true
  try {
    await inv.cargarProveedores()
    const provPorId = new Map((inv.proveedores.value ?? []).map(p => [p.id, p.nombre]))
    const crudo = await inv.lotesRepo.value.readAll({ query: { productoId: props.producto.id } })
    const lista = Array.isArray(crudo) ? crudo : (crudo?.data ?? [])
    let filas = lista
      .filter(l => !props.producto?.id || l.productoId === props.producto.id)
      .map(l => ({ ...l, nombreProveedor: l.proveedorId ? provPorId.get(l.proveedorId) : null }))
    // El repo puede devolver filas crudas (sin saldos): se derivan por lote
    // de los movimientos. Se revisa fila por fila (no solo la primera), porque
    // el servidor puede mezclar filas con y sin saldos calculados.
    if (filas.some(l => l.saldoAlmacen == null || l.saldoQuiosco == null)) {
      const movsCrudo = await inv.movimientosRepo.value.readAll()
      const movs = Array.isArray(movsCrudo) ? movsCrudo : (movsCrudo?.data ?? [])
      const delLote = (movs ?? []).filter(m => !m.anulado)
      filas = filas.map((l) => {
        if (l.saldoAlmacen != null && l.saldoQuiosco != null) return l
        const propios = delLote.filter(m => m.loteId === l.id)
        const saldoAlmacen = propios.reduce((s, m) => s + Math.trunc(Number(m.deltaAlmacen) || 0), 0)
        const saldoQuiosco = propios.reduce((s, m) => s + Math.trunc(Number(m.deltaQuiosco) || 0), 0)
        return {
          ...l,
          saldoAlmacen,
          saldoQuiosco,
          conConsumo: propios.some(m => Number(m.deltaAlmacen) < 0 || Number(m.deltaQuiosco) < 0)
        }
      })
    }
    filas.sort((a, b) => String(b.fechaEntrada ?? '').localeCompare(String(a.fechaEntrada ?? '')))
    lotes.value = filas
  } finally {
    cargando.value = false
  }
}

function abrirCorreccion(lote) {
  corrigiendo.value = lote
  precioNuevo.value = Number(lote.precioUnitario) || 0
  motivo.value = ''
}

async function confirmarCorreccion() {
  guardando.value = true
  try {
    await inv.corregirPrecioLote(corrigiendo.value.id, Number(precioNuevo.value) || 0, motivo.value.trim())
    toast.add({ title: 'Precio corregido', color: 'success' })
    corrigiendo.value = null
    await recargar()
    emit('guardado')
  } catch {
    // useInventario ya muestra el toast de error
  } finally {
    guardando.value = false
  }
}
</script>
