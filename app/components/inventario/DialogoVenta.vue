<template>
  <BaseDialog
    v-model="isOpen"
    :title="cfg.titulo"
    :description="descripcionDialogo"
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

      <!-- Varias líneas dictadas de una vez: una fila por producto, cantidades
           editables y un solo registro al confirmar. -->
      <div v-if="esMultiple" class="space-y-2">
        <div
          v-for="(linea, idx) in lineasForm"
          :key="linea.productoId ?? idx"
          class="space-y-2 rounded-md bg-elevated/50 p-3"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="font-medium truncate">{{ linea.nombre }}</span>
            <span class="font-mono text-sm">{{ fmtPrecio(subtotalLinea(linea)) }}</span>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <UFormField label="Cantidad">
              <BaseInputNumber v-model="linea.cantidad" :step="1" :min="1" />
            </UFormField>
            <UFormField label="Precio de venta">
              <BaseInputNumber v-model="linea.precioVentaUsado" />
            </UFormField>
          </div>
          <p v-if="linea.cantidad > linea.disponible" class="text-xs text-error font-medium">
            Solo hay {{ linea.disponible }} en {{ etiquetaUbicacion.toLowerCase() }}.
          </p>
        </div>
      </div>

      <template v-if="!esMultiple">
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

        <InventarioLotesPicker
          v-if="lotes.length"
          :lotes="lotes"
          :cantidad="Number(form.cantidad) || 0"
          :producto-nombre="producto?.nombre ?? ''"
          @update:consumo="onConsumo"
        />
        <p v-if="!lotes.length && producto?.productoId" class="text-xs text-muted">
          No hay lotes con stock para este producto.
        </p>

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

        <p v-if="loteEspecial" class="text-xs text-muted">
          Lote {{ textoEstadoLote }}: se venderá por su precio de compra; puedes editarlo.
        </p>
        <p v-if="cantidadExcedeStock" class="text-xs text-warning font-medium">
          La cantidad por voz ({{ props.prefill?.cantidad }}) supera el stock disponible ({{ disponible }}). Reduce antes de guardar.
        </p>
        <p v-if="superaDisponible" class="text-xs text-error font-medium">
          Solo hay {{ totalDisponibleStock }} en {{ etiquetaUbicacion.toLowerCase() }}.
        </p>

        <p v-if="esCasa" class="text-xs text-muted">
          Se registrará al costo FIFO real del lote, así que la venta de casa no
          deja ganancia ni pérdida.
        </p>
        <p v-else-if="esRegalo" class="text-xs text-muted">
          Un regalo no tiene importe: solo descuenta la cantidad del inventario.
        </p>
      </template>

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
  modo: { type: String, default: 'venta' },
  // Prefill por voz (opcional): { cantidad, tipoVenta, precioVentaUsado, clienteHint, clienteId }
  prefill: { type: Object, default: null },
  // Fecha de la venta (epoch ms). La usa la revisión de acciones dictadas por
  // voz: la venta pertenece al día en que se dictó, no al día en que se confirma.
  fecha: { type: Number, default: null }
})
const isOpen = defineModel({ type: Boolean, default: false })
const emit = defineEmits(['guardado'])

const inv = useInventario()
const fiado = useCuentasFiado()
const toast = useToast()
const auth = useAuth()
const tts = useTts()
const clientes = ref([])
const lotes = ref([])
const cantidadExcedeStock = ref(false)
const consumoPlan = ref({ lineas: [], consumido: 0, faltante: 0 })
function onConsumo(plan) {
  if (!plan) return
  consumoPlan.value = plan
}

function normalizeVoiceText(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .replace(/\\s+/g, ' ')
    .trim()
}
const guardando = ref(false)

const form = ref({ clienteId: null, cantidad: 1, precioVentaUsado: 0, loteId: null })

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

const modoActual = computed(() => props.prefill?.modo ?? props.modo)
const cfg = computed(() => MODOS[modoActual.value] ?? MODOS.venta)
const esDeuda = computed(() => modoActual.value === 'deuda')
const esCasa = computed(() => modoActual.value === 'casa')
const esRegalo = computed(() => modoActual.value === 'regalo')
const precioFijo = computed(() => cfg.value.precio === 'fijo')

/** Venta con varias líneas dictadas de una vez («3 panes y 2 refrescos»). */
const esMultiple = computed(() =>
  Array.isArray(props.prefill?.lineas) && props.prefill.lineas.length > 1
)
const lineasForm = ref([])

const etiquetaUbicacion = computed(() => props.ubicacion === 'quiosco' ? 'Quiosco' : 'Almacén')
const descripcionDialogo = computed(() => esMultiple.value
  ? `${cfg.value.descripcion} ${etiquetaUbicacion.value.toLowerCase()} · ${lineasForm.value.length} productos`
  : `${cfg.value.descripcion} · ${props.producto?.nombre ?? ''}`)
const disponible = computed(() => Number(loteSeleccionado.value?.saldo ?? 0))
const totalDisponibleStock = computed(() =>
  (lotes.value ?? []).reduce((acc, l) => acc + (Number(l?.saldo) || 0), 0) || Number(props.producto?.stock ?? 0)
)
const superaDisponible = computed(() =>
  consumoPlan.value.faltante > 0
)
const total = computed(() =>
  esMultiple.value
    ? lineasForm.value.reduce(
        (s, l) => s + (Number(l.cantidad) || 0) * (Number(l.precioVentaUsado) || 0),
        0
      )
    : esRegalo.value
      ? 0
      : (Number(form.value.cantidad) || 0) * (Number(form.value.precioVentaUsado) || 0)
)

function subtotalLinea(linea) {
  return (Number(linea?.cantidad) || 0) * (Number(linea?.precioVentaUsado) || 0)
}

const opcionesLote = computed(() =>
  (lotes.value ?? []).map(l => ({
    id: l.id,
    label: `${l.fechaEntrada} · ${Number(l.precioUnitario || 0).toFixed(2)} · disp ${l.saldo}${l.estadoLote && l.estadoLote !== 'normal' ? ` · ${l.estadoLote}` : ''}`
  }))
)

const loteSeleccionado = computed(() =>
  (lotes.value ?? []).find(l => l.id === form.value.loteId) ?? lotes.value?.[0] ?? null
)

const loteEspecial = computed(() => {
  const l = loteSeleccionado.value
  return Boolean(l?.estadoLote && l.estadoLote !== 'normal')
})

const textoEstadoLote = computed(() => {
  switch (loteSeleccionado.value?.estadoLote) {
    case 'defectuoso':
      return 'defectuoso'
    case 'liquidacion':
      return 'liquidación'
    case 'vencimiento_proximo':
      return 'vencimiento próximo'
    default:
      return 'especial'
  }
})

const costoLoteSeleccionado = computed(() =>
  Number(loteSeleccionado.value?.precioUnitario ?? props.producto?.costoActual ?? props.producto?.precioCompraActual ?? 0)
)

const valida = computed(() => {
  if (esMultiple.value) {
    return lineasForm.value.length >= 2 && lineasForm.value.every(l =>
      Boolean(l.productoId)
      && Number(l.cantidad) >= 1
      && Number(l.cantidad) <= Number(l.disponible)
      && Number(l.precioVentaUsado) >= 0
    )
  }
  return Boolean(props.producto?.productoId)
    && Number(form.value.cantidad) >= 1
    && !superaDisponible.value
    && (lotes.value.length === 0 || consumoPlan.value.lineas.length > 0)
    && (esRegalo.value || Number(form.value.precioVentaUsado) >= 0)
    && (!esDeuda.value || Boolean(form.value.clienteId))
})

/** Precio inicial según el modo: venta normal usa el de catálogo; casa y
 * familiar usan el costo actual (el lote más reciente), que es el "precio de
 * compra" que muestra la tabla. Regalo no lleva precio. */
function precioInicial() {
  if (esRegalo.value) return 0
  if (esCasa.value || props.modo === 'familiar') {
    return costoLoteSeleccionado.value
  }
  return Number(props.producto?.precioVentaActual ?? 0)
}

// Mientras el diálogo se abre asigna lote y precio por su cuenta, incluido el
// precio dictado por voz. El watcher de lote solo debe reaccionar a un cambio
// manual del jefe: si corriera al abrir, pisaría el precio dictado con el del
// catálogo y la venta cobraría otro importe que el que se anunció.
let abriendo = false

watch(isOpen, async (open) => {
  if (!open) {
    abriendo = false
    cantidadExcedeStock.value = false
    lineasForm.value = []
    return
  }
  abriendo = true
  cantidadExcedeStock.value = false

  // Venta con varias líneas: no hay lote que elegir (cada producto consume por
  // FIFO al registrar) y el stock ya viene proyectado desde la voz.
  if (esMultiple.value) {
    form.value = { clienteId: null, cantidad: 1, precioVentaUsado: 0, loteId: null }
    lineasForm.value = props.prefill.lineas.map(l => ({
      productoId: l.productoId,
      nombre: l.nombre,
      cantidad: Math.max(1, Math.trunc(Number(l.cantidad) || 1)),
      precioVentaUsado: Number(l.precioVentaUsado) || 0,
      disponible: Number(l.disponible ?? l.fila?.[props.ubicacion] ?? 0),
      fila: l.fila ?? null
    }))
    try {
      const pid = auth.usuarioActual.value?.puestoId
      clientes.value = (await fiado.cargarClientes(pid)) ?? []
    } catch {
      clientes.value = []
    }
    if (props.prefill?.clienteId) form.value.clienteId = props.prefill.clienteId
    abriendo = false
    return
  }

  // La línea nace del producto tocado: cantidad 1 y el precio que corresponda
  // al modo. El jefe no puede cambiar qué producto se vende.
  form.value = {
    clienteId: null,
    cantidad: 1,
    precioVentaUsado: precioInicial(),
    loteId: null
  }
  // El cliente es opcional en todos los modos menos en la deuda, pero se
  // ofrece en todos para poder asociar la salida a una persona.
  try {
    const pid = auth.usuarioActual.value?.puestoId
    const [cls, ls] = await Promise.all([
      fiado.cargarClientes(pid) ?? [],
      inv.lotesConStock(props.producto?.productoId, props.ubicacion)
    ])
    clientes.value = cls ?? []
    lotes.value = ls ?? []
    form.value.loteId = lotes.value[0]?.id ?? null
    if (esCasa.value || props.modo === 'familiar' || loteEspecial.value) {
      form.value.precioVentaUsado = costoLoteSeleccionado.value
    }

    if (props.prefill?.clienteHint && !props.prefill?.clienteId) {
      const wanted = normalizeVoiceText(props.prefill.clienteHint)
      const matched = (clientes.value ?? []).find((c) => {
        const name = normalizeVoiceText(c?.nombre)
        return name.includes(wanted) || wanted.includes(name)
      })
      if (matched) form.value.clienteId = matched.id
    }

    if (props.prefill) {
      if (props.prefill.clienteId) form.value.clienteId = props.prefill.clienteId
      if (props.prefill.cantidad != null) {
        const qty = Math.max(1, Math.trunc(Number(props.prefill.cantidad) || 1))
        form.value.cantidad = qty
        const totalLotes = (lotes.value ?? []).reduce((acc, l) => acc + (Number(l?.saldo) || 0), 0)
        const max = totalLotes > 0 ? totalLotes : Number(props.producto?.stock ?? 0)
        cantidadExcedeStock.value = Boolean(max && qty > max)
      }
      if (esRegalo.value) {
        form.value.precioVentaUsado = 0
      } else if (precioFijo.value) {
        form.value.precioVentaUsado = precioInicial()
      } else if (props.prefill.precioVentaUsado != null) {
        form.value.precioVentaUsado = Number(props.prefill.precioVentaUsado)
      }
    }
  } catch {
    clientes.value = []
    lotes.value = []
  } finally {
    // Después del flush: el watcher de lote (flush 'post') ya pasó.
    await nextTick()
    abriendo = false
  }
})

watch(() => form.value.loteId, () => {
  if (!isOpen.value || abriendo) return
  if (esCasa.value || props.modo === 'familiar') {
    form.value.precioVentaUsado = costoLoteSeleccionado.value
    return
  }
  if (esRegalo.value) return
  if (loteEspecial.value) {
    form.value.precioVentaUsado = costoLoteSeleccionado.value
  } else {
    form.value.precioVentaUsado = Number(props.producto?.precioVentaActual ?? 0)
  }
}, { flush: 'post' })

async function confirmar() {
  const lineas = esMultiple.value
    ? lineasForm.value.map((l, idx) => ({
        productoId: l.productoId,
        cantidad: Math.trunc(Number(l.cantidad) || 0),
        precioVentaUsado: Number(l.precioVentaUsado) || 0,
        secuencia: idx,
        // FIFO: cada línea consume del lote más antiguo del producto.
        loteId: null
      }))
    : (() => {
        const planLineas = (consumoPlan.value?.lineas || []).filter(l => Number(l?.cantidad) > 0)
        const baseLineas = planLineas.length
          ? planLineas
          : [{ loteId: (form.value.loteId ?? lotes.value?.[0]?.id ?? null), cantidad: Math.trunc(Number(form.value.cantidad) || 0) }]
        return baseLineas.map((c, idx) => ({
          productoId: props.producto.productoId,
          cantidad: Math.trunc(Number(c.cantidad) || 0),
          precioVentaUsado: esRegalo.value ? 0 : (Number(form.value.precioVentaUsado) || 0),
          secuencia: idx,
          loteId: c.loteId ?? form.value.loteId ?? lotes.value?.[0]?.id ?? null
        }))
      })()
  guardando.value = true
  try {
    let creada = null
    if (esDeuda.value) {
      // registrarDeudaDirecta no lanza: avisa con { ok: false } y ya puso el
      // toast, así que sin éxito el diálogo se queda abierto.
      const r = await fiado.registrarDeudaDirecta({
        clienteId: form.value.clienteId,
        ubicacion: props.ubicacion,
        lineas
      })
      if (!r?.ok) return
      creada = r
      toast.add({ title: cfg.value.ok, color: 'success' })
      void tts.speak(cfg.value.ok)
    } else {
      creada = await inv.registrarVentaDirecta({
        ubicacion: props.ubicacion,
        tipoVenta: cfg.value.tipoVenta ?? 'directa',
        clienteId: form.value.clienteId || null,
        ...(props.fecha ? { creadoEn: Number(props.fecha) } : {}),
        lineas
      })
      toast.add({ title: cfg.value.ok, color: 'success' })
      void tts.speak(cfg.value.ok)
    }
    isOpen.value = false
    // `creada` permite a la pantalla de revisión enlazar la acción con la venta
    // que acaba de nacer (id, importe real) en lugar de adivinarlo.
    emit('guardado', creada)
  } catch {
    // useInventario ya muestra el toast de error.
  } finally {
    guardando.value = false
  }
}

defineExpose({ confirmar })
</script>
