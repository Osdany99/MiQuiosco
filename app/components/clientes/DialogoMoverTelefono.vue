<script setup>
/**
 * Mueve un número de un cliente a otro.
 *
 * Un número pertenece a un solo cliente, pero puede cambiar de dueño (el hijo
 * que se independiza, la línea que se traspasa). El historial ya guardado no se
 * toca: las recargas viejas siguen apuntando al número; lo que cambia es a
 * quién se le imputan las próximas.
 */
const abierta = defineModel({ type: Boolean, default: false })

const props = defineProps({
  /** Fila de `clientes_telefonos` que se mueve. */
  telefono: { type: Object, default: null },
  clientes: { type: Array, default: () => [] }
})

const emit = defineEmits(['mover'])

const destino = ref(null)

watch(abierta, (v) => {
  if (v) destino.value = null
})

const opciones = computed(() =>
  [...props.clientes]
    .filter(c => c.id !== props.telefono?.clienteId)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    .map(c => ({ label: c.nombre, value: c.id }))
)

const clienteActual = computed(() =>
  props.clientes.find(c => c.id === props.telefono?.clienteId) ?? null
)

function confirmar() {
  if (!destino.value) return
  emit('mover', destino.value)
}
</script>

<template>
  <BaseDialog
    v-model="abierta"
    title="Mover número"
    :description="telefono ? `Número ${telefono.telefono}` : ''"
    confirm-text="Mover"
    :disabled-guardar="!destino"
    @confirm="confirmar"
    @cancel="abierta = false"
  >
    <div class="space-y-4">
      <UAlert
        v-if="clienteActual"
        color="neutral"
        variant="soft"
        icon="i-lucide-arrow-right-left"
        :title="`Ahora pertenece a «${clienteActual.nombre}»`"
        :description="telefono?.etiqueta
          ? `El nombre del número («${telefono.etiqueta}») se conserva.`
          : 'El nombre del número, si lo tiene, se conserva.'"
      />

      <UFormField label="Nuevo dueño" required>
        <USelectMenu
          v-model="destino"
          :items="opciones"
          value-key="value"
          label-key="label"
          placeholder="Elige el cliente"
          class="w-full"
        />
      </UFormField>

      <p class="text-xs text-muted">
        El cambio se aplica al momento: aunque cierres la edición sin guardar,
        el número ya no vuelve al dueño anterior. Las recargas y deudas ya
        registradas no cambian de cliente; solo las próximas recargas a este
        número se imputarán al nuevo dueño.
      </p>
    </div>
  </BaseDialog>
</template>
