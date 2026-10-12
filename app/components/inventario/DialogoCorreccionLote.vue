<template>
  <BaseDialog
    v-model="isOpen"
    :title="`Corregir entrada - ${nombre}`"
    description="Corrige la cantidad o el precio con que entró al almacén. Lo que ya salió del lote no se toca."
    confirm-text="Guardar corrección"
    :loading="guardando"
    :disabled-guardar="!valida"
    @confirm="confirmar"
    @cancel="isOpen = false"
  >
    <div v-if="lote" class="space-y-4">
      <div class="flex items-center justify-between gap-2 rounded-md bg-elevated/50 px-3 py-2 text-sm">
        <span class="text-muted">Entrada del {{ lote.fechaEntrada }}</span>
        <span class="flex items-center gap-2">
          <span class="text-muted">Almacén:</span> {{ saldoAlmacen }}
          <span class="text-muted">·</span>
          <span class="text-muted">Quiosco:</span> {{ saldoQuiosco }}
        </span>
      </div>

      <UAlert
        :icon="tieneSalidas ? 'i-lucide-alert-triangle' : 'i-lucide-info'"
        :color="tieneSalidas ? 'warning' : 'info'"
        variant="soft"
        :title="tieneSalidas ? 'De este lote ya salió mercancía' : 'Todo este lote sigue en el almacén'"
        :description="aviso"
      />

      <div class="flex gap-2 items-start">
        <UFormField
          label="Cantidad"
          class="w-28"
          :hint="`Mínimo ${piso}`"
          :error="errorCantidad"
        >
          <BaseInputNumber v-model="cantidadNueva" :step="1" :min="minCantidad" />
        </UFormField>
        <UFormField label="P. compra" class="w-32">
          <BaseInputNumber v-model="precioNuevo" :min="0" />
        </UFormField>
      </div>

      <UFormField label="Motivo" :error="errorMotivo">
        <UInput
          v-model="motivo"
          placeholder="Se contaron mal las unidades / la factura decía otra cosa..."
          class="w-full"
        />
      </UFormField>
    </div>
  </BaseDialog>
</template>

<script setup>
/**
 * Corrección de cantidad y precio de una entrada al almacén.
 *
 * Único sitio por donde se corrige un lote, tanto desde la fila del historial
 * de compras como desde el diálogo "Ver lotes" de un producto.
 *
 * Las reglas (hasta dónde puede bajar la cantidad) no viven aquí: las aplica
 * `useInventario.corregirLote`, que usa el mismo constructor que el servidor.
 * Este diálogo solo muestra el piso y avisa de lo que va a pasar.
 */
const props = defineProps({
  /** Fila de lote con saldoAlmacen/saldoQuiosco/piso resueltos. */
  lote: { type: Object, default: null }
})
const isOpen = defineModel({ type: Boolean, default: false })
const emit = defineEmits(['guardado'])

const inv = useInventario()
const toast = useToast()

const cantidadNueva = ref(1)
const precioNuevo = ref(0)
const motivo = ref('')
const guardando = ref(false)

/**
 * El piso lo manda el servidor (o el mismo cálculo en offline). Si la fila
 * viene de una lista que no lo trae, cae al saldo de almacén: nunca menos de
 * lo que ya salió.
 */
const piso = computed(() => {
  const declarado = Number(props.lote?.piso)
  if (Number.isFinite(declarado) && props.lote?.piso != null) return Math.max(0, declarado)
  return Math.max(0, Number(props.lote?.salidasAlmacen) || 0)
})

const saldoAlmacen = computed(() => Number(props.lote?.saldoAlmacen ?? 0) || 0)
const saldoQuiosco = computed(() => Number(props.lote?.saldoQuiosco ?? 0) || 0)

/** Hay consumo cuando algo salió del almacén o cuando hay algo en el quiosco. */
const tieneSalidas = computed(() =>
  Boolean(props.lote?.conConsumo) || piso.value > 0 || saldoQuiosco.value > 0
)

const minCantidad = computed(() => Math.max(1, piso.value))

const cantidad = computed(() => Math.trunc(Number(cantidadNueva.value) || 0))
const errorCantidad = computed(() => {
  if (cantidad.value < 1) return 'Mínimo 1 unidad'
  if (cantidad.value < piso.value) {
    return `No puede ser menos de ${piso.value}: ya salieron ${piso.value} unidades del almacén`
  }
  return null
})
const errorMotivo = computed(() => {
  if (!motivo.value.trim()) return 'El motivo es obligatorio'
  if (motivo.value.trim().length > 200) return 'Máximo 200 caracteres'
  return null
})

/** Saldos que quedarían si se guarda, para no guardar a ciegas. */
const almacenResultante = computed(() => {
  const original = Math.trunc(Number(props.lote?.cantidadInicial) || 0)
  if (!props.lote || original === cantidad.value) return saldoAlmacen.value
  return Math.max(0, saldoAlmacen.value + (cantidad.value - original))
})

const aviso = computed(() => {
  const partes = []
  if (piso.value > 0) {
    partes.push(
      `Ya salieron ${piso.value} unidades de este lote al quiosco o a la venta, `
      + `por eso la cantidad no puede bajar de ${piso.value}.`
    )
  }
  if (saldoQuiosco.value > 0) {
    partes.push(
      `Hay ${saldoQuiosco.value} unidades de este lote en el quiosco: la corrección no las toca.`
    )
  }
  partes.push('El cambio de precio revalúa lo que queda por vender; lo ya vendido y los cuadres cerrados no cambian.')
  return partes.join(' ')
})

const nombre = computed(() => props.lote?.nombreProducto ?? '')

const valida = computed(() => {
  if (!props.lote || props.lote.anulado) return false
  if (errorCantidad.value || errorMotivo.value) return false
  const cantIgual = cantidad.value === Math.trunc(Number(props.lote.cantidadInicial) || 0)
  const precioIgual = (Number(precioNuevo.value) || 0) === (Number(props.lote.precioUnitario) || 0)
  return !(cantIgual && precioIgual)
})

watch(isOpen, (open) => {
  if (!open || !props.lote) return
  cantidadNueva.value = Math.trunc(Number(props.lote.cantidadInicial) || 0)
  precioNuevo.value = Number(props.lote.precioUnitario) || 0
  motivo.value = ''
})

async function confirmar() {
  if (!valida.value) return
  guardando.value = true
  try {
    await inv.corregirLote(props.lote.id, {
      cantidadInicial: cantidad.value,
      precioUnitario: Number(precioNuevo.value) || 0,
      motivo: motivo.value.trim()
    })
    toast.add({
      title: 'Entrada corregida',
      description: `Quedan ${almacenResultante.value} en el almacén.`,
      color: 'success'
    })
    isOpen.value = false
    emit('guardado')
  } catch {
    // useInventario ya muestra el toast de error
  } finally {
    guardando.value = false
  }
}
</script>
