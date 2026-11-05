<template>
  <BaseDialog
    v-model="isOpen"
    :title="cfg.titulo"
    :description="`${cfg.descripcion} · ${producto?.nombre ?? ''}`"
    :confirm-text="cfg.confirmar"
    :loading="guardando"
    :disabled-guardar="!valida"
    @confirm="confirmar"
    @cancel="isOpen = false"
  >
    <div class="space-y-4">
      <!-- Producto y ubicación vienen de la fila desde la que se abrió el
           diálogo: no se cambian aquí, solo se confirman. -->
      <UFormField :label="esDeuda ? 'Cliente' : 'Cliente (opcional)'" :required="esDeuda">
        <USelectMenu
          v-model="form.clienteId"
          :items="clientes"
          value-key="id"
          label-key="nombre"
          placeholder="Seleccionar cliente..."
          class="w-full"
          :clearable="!esDeuda"
        />
      </UFormField>

      <div class="flex items-center justify-between gap-2 rounded-md bg-elevated/50 px-3 py-2">
        <span class="font-medium truncate">{{ producto?.nombre ?? '—' }}</span>
        <UBadge
          size="sm"
          variant="soft"
          color="neutral"
          :icon="ubicacion === 'quiosco' ? 'i-lucide-store' : 'i-lucide-warehouse'"
          :label="etiquetaUbicacion"
        />
      </div>

      <div class="grid gap-2" :class="esRegalo ? 'grid-cols-1' : 'grid-cols-2'">
        <UFormField label="Cantidad">
          <BaseInputNumber v-model="form.cantidad" :step="1" :min="1" />
        </UFormField>
        <UFormField
          v-if="!esRegalo"
          :label="precioFijo ? 'Precio (costo)' : 'Precio de venta'"
        >
          <BaseInputNumber
            v-model="form.precioVentaUsado"
            :readonly="precioFijo"
            :increment="!precioFijo"
            :decrement="!precioFijo"
          />
        </UFormField>
      </div>

      <p v-if="superaDisponible" class="text-xs text-error font-medium">
        Solo hay {{ disponible }} en {{ etiquetaUbicacion.toLowerCase() }}.
      </p>

      <p v-if="esCasa" class="text-xs text-muted">
        Se registrará al costo FIFO real del lote, así que la venta de casa no
        deja ganancia ni pérdida.
      </p>
      <p v-else-if="esRegalo" class="text-xs text-muted">
        Un regalo no tiene importe: solo descuenta la cantidad del inventario.
      </p>

      <div class="rounded-md bg-elevated/50 p-3 text-sm flex justify-between">
        <span>{{ esRegalo ? 'Importe' : 'Total' }}</span>
        <span class="font-mono font-semibold">{{ fmtPrecio(total) }}</span>
      </div>
    </div>
  </BaseDialog>
</template>

<script setup>
const props = defineProps({
  // Fila de saldos desde la que se abrió (vistaSaldos): trae productoId,
  // nombre, precioVentaActual, costoActual y el stock de cada ubicación.
  producto: { type: Object, default: null },
  ubicacion: { type: String, default: 'almacen' },
  // 'venta' | 'deuda' | 'casa' | 'familiar' | 'regalo'
  modo: { type: String, default: 'venta' }
})
const isOpen = defineModel({ type: Boolean, default: false })
const emit = defineEmits(['guardado'])

const inv = useInventario()
const fiado = useCuentasFiado()
const toast = useToast()
const auth = useAuth()

const clientes = ref([])
const guardando = ref(false)

const form = ref({ clienteId: null, cantidad: 1, precioVentaUsado: 0 })

/**
 * Cada modo comparte el mismo flujo; solo cambian textos y la política del
 * precio. `precio`:
 *  - libre:    lo escribe el jefe.
 *  - costo:    arranca en el costo y se puede editar (familiar).
 *  - fijo:     arranca en el costo y no se edita (casa); el constructor lo
 *              vuelve a fijar al costo FIFO exacto.
 *  - ninguno:  no hay precio (regalo).
 */
const MODOS = {
  venta: {
    titulo: 'Venta directa',
    descripcion: 'Sale de',
    confirmar: 'Registrar venta',
    tipoVenta: 'directa',
    precio: 'libre',
    ok: 'Venta registrada'
  },
  deuda: {
    titulo: 'Deuda directa',
    descripcion: 'Fiado que sale de',
    confirmar: 'Registrar deuda',
    precio: 'libre',
    ok: 'Deuda registrada'
  },
  casa: {
    titulo: 'Venta casa',
    descripcion: 'Sale de',
    confirmar: 'Registrar venta',
    tipoVenta: 'casa',
    precio: 'fijo',
    ok: 'Venta de casa registrada'
  },
  familiar: {
    titulo: 'Venta familiar',
    descripcion: 'Sale de',
    confirmar: 'Registrar venta',
    tipoVenta: 'familiar',
    precio: 'costo',
    ok: 'Venta familiar registrada'
  },
  regalo: {
    titulo: 'Regalo',
    descripcion: 'Sale de',
    confirmar: 'Registrar regalo',
    tipoVenta: 'regalo',
    precio: 'ninguno',
    ok: 'Regalo registrado'
  }
}

const cfg = computed(() => MODOS[props.modo] ?? MODOS.venta)
const esDeuda = computed(() => props.modo === 'deuda')
const esCasa = computed(() => props.modo === 'casa')
const esRegalo = computed(() => props.modo === 'regalo')
const precioFijo = computed(() => cfg.value.precio === 'fijo')

const etiquetaUbicacion = computed(() => props.ubicacion === 'quiosco' ? 'Quiosco' : 'Almacén')
const disponible = computed(() => Number(props.producto?.[props.ubicacion] ?? 0))
const superaDisponible = computed(() =>
  Number(form.value.cantidad) > disponible.value
)
const total = computed(() =>
  esRegalo.value
    ? 0
    : (Number(form.value.cantidad) || 0) * (Number(form.value.precioVentaUsado) || 0)
)

const valida = computed(() =>
  Boolean(props.producto?.productoId)
  && Number(form.value.cantidad) >= 1
  && !superaDisponible.value
  && (esRegalo.value || Number(form.value.precioVentaUsado) >= 0)
  && (!esDeuda.value || Boolean(form.value.clienteId))
)

/** Precio inicial según el modo: venta normal usa el de catálogo; casa y
 * familiar usan el costo actual (el lote más reciente), que es el "precio de
 * compra" que muestra la tabla. Regalo no lleva precio. */
function precioInicial() {
  if (esRegalo.value) return 0
  if (esCasa.value || props.modo === 'familiar') {
    return Number(props.producto?.costoActual ?? props.producto?.precioCompraActual ?? 0)
  }
  return Number(props.producto?.precioVentaActual ?? 0)
}

watch(isOpen, async (open) => {
  if (!open) return
  // La línea nace del producto tocado: cantidad 1 y el precio que corresponda
  // al modo. El jefe no puede cambiar qué producto se vende.
  form.value = {
    clienteId: null,
    cantidad: 1,
    precioVentaUsado: precioInicial()
  }
  // El cliente es opcional en todos los modos menos en la deuda, pero se
  // ofrece en todos para poder asociar la salida a una persona.
  try {
    clientes.value = await fiado.cargarClientes(auth.usuarioActual.value?.puestoId) ?? []
  } catch {
    clientes.value = []
  }
})

async function confirmar() {
  const lineas = [{
    productoId: props.producto.productoId,
    cantidad: Math.trunc(Number(form.value.cantidad) || 0),
    precioVentaUsado: esRegalo.value ? 0 : (Number(form.value.precioVentaUsado) || 0),
    secuencia: 0
  }]
  guardando.value = true
  try {
    if (esDeuda.value) {
      // registrarDeudaDirecta no lanza: avisa con { ok: false } y ya puso el
      // toast, así que sin éxito el diálogo se queda abierto.
      const r = await fiado.registrarDeudaDirecta({
        clienteId: form.value.clienteId,
        ubicacion: props.ubicacion,
        lineas
      })
      if (!r?.ok) return
      toast.add({ title: cfg.value.ok, color: 'success' })
    } else {
      await inv.registrarVentaDirecta({
        ubicacion: props.ubicacion,
        tipoVenta: cfg.value.tipoVenta ?? 'directa',
        clienteId: form.value.clienteId || null,
        lineas
      })
      toast.add({ title: cfg.value.ok, color: 'success' })
    }
    isOpen.value = false
    emit('guardado')
  } catch {
    // useInventario ya muestra el toast de error.
  } finally {
    guardando.value = false
  }
}
</script>
