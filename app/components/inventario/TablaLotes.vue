<template>
  <BaseDialog
    v-model="isOpen"
    :title="`Lotes - ${producto?.nombre}`"
    description="Cada lote conserva su precio de compra. Se corrige mientras no se toque lo que ya salió."
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
          v-if="!row.original.anulado"
          icon="i-lucide-pencil"
          size="xs"
          color="neutral"
          variant="ghost"
          title="Corregir cantidad o precio"
          @click="abrirCorreccion(row.original)"
        />
      </template>
    </UTable>
  </BaseDialog>

  <InventarioDialogoCorreccionLote v-model="showCorreccion" :lote="corrigiendo" @guardado="alGuardar" />
</template>

<script setup>
import { saldosDeLote } from '../../../shared/inventario/operaciones'

const props = defineProps({
  producto: { type: Object, default: null }
})
const isOpen = defineModel({ type: Boolean, default: false })
const emit = defineEmits(['guardado'])

const inv = useInventario()

const lotes = ref([])
const cargando = ref(false)
const showCorreccion = ref(false)
const corrigiendo = ref(null)

const columns = [
  { accessorKey: 'fechaEntrada', header: 'Entrada' },
  { accessorKey: 'cantidadInicial', header: 'Cant.' },
  { accessorKey: 'precioUnitario', header: 'P. compra' },
  { accessorKey: 'saldo', header: 'Saldo' },
  { accessorKey: 'proveedor', header: 'Proveedor' },
  { accessorKey: 'acciones', header: '' }
  // La columna de proveedor se oculta con la bandera; nombreProveedor() y el
  // slot #proveedor-cell siguen vivos para reactivarla. Ver app/utils/flags.js
].filter(c => MOSTRAR_PROVEEDOR || c.accessorKey !== 'proveedor')

function nombreProveedor(lote) {
  if (lote.nombreProveedor) return lote.nombreProveedor
  return lote.lugarCompra || '—'
}

watch(isOpen, async (open) => {
  if (!open || !props.producto?.id) return
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

    // El repo puede devolver filas crudas (sin saldos): se derivan con la
    // misma regla del servidor (saldosPorLote) para que el piso del diálogo de
    // corrección sea el mismo online que offline.
    const faltaSaldo = filas.some(l => l.saldoAlmacen == null || l.saldoQuiosco == null)
    if (faltaSaldo) {
      const movsCrudo = await inv.movimientosRepo.value.readAll()
      const movs = Array.isArray(movsCrudo) ? movsCrudo : (movsCrudo?.data ?? [])
      filas = filas.map((l) => {
        if (l.saldoAlmacen != null && l.saldoQuiosco != null) return l
        const s = saldosDeLote(l, movs)
        return {
          ...l,
          saldoAlmacen: s.almacen,
          saldoQuiosco: s.quiosco,
          conConsumo: s.consumido,
          salidasAlmacen: s.salidasAlmacen,
          piso: s.piso
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
  showCorreccion.value = true
}

async function alGuardar() {
  await recargar()
  emit('guardado')
}
</script>
