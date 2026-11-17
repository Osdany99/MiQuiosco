<template>
  <BaseDialog
    v-model="isOpen"
    title="Cambiar el precio de venta"
    :description="`${nombre || 'Producto'} · precio actual ${fmtPrecio(actual)}`"
    confirm-text="Guardar precio"
    :loading="guardando"
    :disabled-guardar="!valida"
    @confirm="confirmar"
    @cancel="isOpen = false"
  >
    <div class="space-y-4">
      <div class="flex items-center justify-between gap-2 rounded-md bg-elevated/50 px-3 py-2">
        <span class="font-medium truncate">{{ nombre || '—' }}</span>
        <UBadge
          size="sm"
          variant="soft"
          color="neutral"
          label="Precio de venta"
        />
      </div>

      <div class="grid grid-cols-2 gap-3">
        <UFormField label="Precio actual">
          <p class="h-8 flex items-center font-mono">
            {{ fmtPrecio(actual) }}
          </p>
        </UFormField>
        <UFormField label="Precio nuevo">
          <BaseInputNumber v-model="nuevo" :min="0" class="w-full" />
        </UFormField>
      </div>

      <p class="text-xs text-muted">
        El historial de precios se escribe al guardar. Las ventas ya hechas y los
        cuadres cerrados no cambian.
      </p>
      <p v-if="errorPrecio" class="text-sm text-error font-medium">
        {{ errorPrecio }}
      </p>
    </div>
  </BaseDialog>
</template>

<script setup>
import { productos as config } from '../../../shared/tables'

/**
 * Cambio del precio de venta de un producto (Fase L, asistido por voz).
 *
 * La voz solo prellena: el precio no se guarda hasta pulsar «Guardar precio».
 * El historial de precios lo escribe el servidor (o la mutación local) en el
 * mismo guardado del producto; aquí no se toca ninguna otra tabla.
 */
const props = defineProps({
  /** Fila del catálogo: `productoId`, `nombre` y `precioVentaActual`. */
  producto: { type: Object, default: null },
  /** Voz: precio nuevo dictado (null = no se oyó). */
  prefill: { type: Object, default: null }
})
const isOpen = defineModel({ type: Boolean, default: false })
const emit = defineEmits(['guardado'])

const toast = useToast()
// Mismo config que `/productos`: el patch pasa por el endpoint del producto, que
// es quien escribe `historial_precios` en el mismo guardado.
const { patch: patchProducto } = useRepo(config)

const nuevo = ref(0)
const guardando = ref(false)

const nombre = computed(() => props.producto?.nombre ?? '')
const actual = computed(() => Number(props.producto?.precioVentaActual ?? 0))

const errorPrecio = computed(() => {
  const valor = Number(nuevo.value) || 0
  if (valor <= 0) return 'El precio tiene que ser mayor que cero'
  if (valor === actual.value) return 'Ese es el precio que ya tiene'
  return null
})
const valida = computed(() => Boolean(props.producto?.productoId) && !errorPrecio.value)

watch(isOpen, (open) => {
  if (!open) return
  const dicho = Number(props.prefill?.precio)
  nuevo.value = Number.isFinite(dicho) && dicho > 0 ? dicho : actual.value
})

async function confirmar() {
  if (!valida.value) return
  guardando.value = true
  try {
    const { error } = await patchProducto(props.producto.productoId, {
      precioVentaActual: Number(nuevo.value)
    })
    if (error) throw error
    toast.add({
      title: 'Precio actualizado',
      description: `${nombre.value}: ${fmtPrecio(actual.value)} → ${fmtPrecio(Number(nuevo.value))}`,
      color: 'success'
    })
    isOpen.value = false
    emit('guardado')
  } catch {
    // useInventario/useRepo ya muestran el toast de error.
  } finally {
    guardando.value = false
  }
}

// La confirmación hablada pulsa este mismo botón.
defineExpose({ confirmar })
</script>
