<template>
  <BaseDialog
    v-model="isOpen"
    title="Anular entrada"
    description="Se da por inexistente esta compra. Útil cuando la entrada fue un error (otro producto, otra cantidad)."
    confirm-text="Anular entrada"
    confirm-color="error"
    confirm-icon="i-lucide-trash-2"
    :loading="guardando"
    :disabled-guardar="!valida"
    @confirm="confirmar"
    @cancel="isOpen = false"
  >
    <div v-if="lote" class="space-y-4">
      <div class="space-y-2 rounded-md bg-elevated/50 px-3 py-2 text-sm">
        <div class="flex items-center justify-between gap-2">
          <span class="font-medium truncate">{{ nombre }}</span>
          <span class="font-mono text-xs text-muted shrink-0">{{ lote.fechaEntrada }}</span>
        </div>
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
          <span>Cantidad: <span class="text-default">{{ cantidad }}</span></span>
          <span>P. compra: <span class="text-default">{{ fmtPrecio(precioUnitario) }}</span></span>
          <span>Valor: <span class="text-default">{{ fmtPrecio(valor) }}</span></span>
        </div>
        <div class="text-muted">
          Almacén: <span class="text-default">{{ saldoAlmacen }}</span>
          <span class="mx-1">·</span>
          Quiosco: <span class="text-default">{{ saldoQuiosco }}</span>
        </div>
      </div>

      <UAlert
        v-if="avisoDia"
        icon="i-lucide-calendar-x"
        color="warning"
        variant="soft"
        title="La compra es de otro día"
        :description="avisoDia"
      />

      <UAlert
        icon="i-lucide-info"
        color="info"
        variant="soft"
        title="La mercancía sale del inventario"
        description="Se descuentan todas las unidades de este lote y la compra deja de contar en su día. No se borra el registro: queda anulada, con tu motivo."
      />

      <UFormField label="Motivo" :error="errorMotivo">
        <UInput
          v-model="motivo"
          placeholder="Era otro producto / eran 10 panes y no 10 refrescos..."
          class="w-full"
        />
      </UFormField>
    </div>
  </BaseDialog>
</template>

<script setup>
/**
 * Anulación de una entrada al almacén todavía intacta.
 *
 * Es el arreglo del error de captura: se dio de alta el producto equivocado y
 * ni corregir la cantidad ni el precio lo soluciona. Se invalida la entrada
 * (tombstone) y se da de alta la buena.
 *
 * Las reglas no viven aquí: `useInventario.anularLote` aplica el mismo
 * constructor que el servidor (construirAnulacionLote), que es el que decide
 * si el lote se puede anular. Este diálogo solo muestra qué va a pasar.
 */
import { hoyNegocio } from '../../utils'

const props = defineProps({
  /** Fila de lote con saldos y `anulable` resueltos. */
  lote: { type: Object, default: null }
})
const isOpen = defineModel({ type: Boolean, default: false })
const emit = defineEmits(['guardado'])

const inv = useInventario()
const toast = useToast()

const motivo = ref('')
const guardando = ref(false)

const nombre = computed(() => props.lote?.nombreProducto ?? '')
const cantidad = computed(() => Math.trunc(Number(props.lote?.cantidadInicial) || 0))
const precioUnitario = computed(() => Number(props.lote?.precioUnitario) || 0)
const valor = computed(() => Math.round(cantidad.value * precioUnitario.value * 100) / 100)
const saldoAlmacen = computed(() => Number(props.lote?.saldoAlmacen ?? 0) || 0)
const saldoQuiosco = computed(() => Number(props.lote?.saldoQuiosco ?? 0) || 0)

/** Solo si la entrada es de un día anterior (el reporte de compras de ese día la pierde). */
const avisoDia = computed(() => {
  const fecha = String(props.lote?.fechaEntrada ?? '')
  if (!fecha || fecha === hoyNegocio()) return ''
  return `Esta compra quedó anotada el ${fecha} y dejará de contar en las compras de ese día.`
})

const errorMotivo = computed(() => {
  if (!motivo.value.trim()) return 'El motivo es obligatorio'
  if (motivo.value.trim().length > 200) return 'Máximo 200 caracteres'
  return null
})

const valida = computed(() => {
  if (!props.lote || props.lote.anulado) return false
  if (props.lote.anulable === false) return false
  return !errorMotivo.value
})

watch(isOpen, (open) => {
  if (!open) return
  motivo.value = ''
})

async function confirmar() {
  // Doble toque mientras guarda: no se anula dos veces.
  if (!valida.value || guardando.value) return
  guardando.value = true
  try {
    await inv.anularLote(props.lote.id, { motivo: motivo.value.trim() })
    toast.add({
      title: 'Entrada anulada',
      description: `Se descuentan ${cantidad.value} unidades del inventario. Ya puedes dar la entrada correcta.`,
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
