<script setup>
/**
 * Asigna cliente a una recarga que entró sin reconocer.
 * Dos caminos: elegir un cliente existente o crear uno nuevo con el nombre.
 * En ambos casos el número queda emparejado para la próxima vez (lo hace la
 * página con crearClienteConTelefono).
 */
const abierta = defineModel({ type: Boolean, default: false })

const props = defineProps({
  telefono: { type: String, default: '' },
  montoNominal: { type: Number, default: 0 },
  clientes: { type: Array, default: () => [] }
})

const emit = defineEmits(['asignar', 'crear'])

const clienteId = ref(null)
const nombreNuevo = ref('')

const itemsClientes = computed(() =>
  (props.clientes || []).map(c => ({ label: c.nombre, value: c.id }))
)

watch(abierta, (v) => {
  if (v) {
    clienteId.value = null
    nombreNuevo.value = ''
  }
})

function confirmar() {
  const nombre = nombreNuevo.value.trim()
  if (nombre) {
    emit('crear', { nombre })
    return
  }
  if (clienteId.value) emit('asignar', clienteId.value)
}
</script>

<template>
  <BaseDialog
    v-model="abierta"
    title="Asignar cliente"
    :description="`Recarga de ${montoNominal} CUP al ${telefono}`"
    confirm-text="Guardar"
    :disabled-guardar="!clienteId && !nombreNuevo.trim()"
    @confirm="confirmar"
    @cancel="abierta = false"
  >
    <div class="space-y-4">
      <UFormField label="Cliente existente">
        <USelect
          v-model="clienteId"
          :items="itemsClientes"
          placeholder="Seleccionar..."
          class="w-full"
          :disabled="!!nombreNuevo.trim()"
        />
      </UFormField>

      <div class="flex items-center gap-3 text-xs text-muted">
        <span class="flex-1 border-t border-default" />
        o nuevo
        <span class="flex-1 border-t border-default" />
      </div>

      <UFormField label="Nombre del cliente nuevo">
        <UInput
          v-model="nombreNuevo"
          placeholder="Ej. Marta la de la esquina"
          class="w-full"
          :disabled="!!clienteId"
        />
      </UFormField>
      <p class="text-xs text-muted">
        Al crearlo, este número queda emparejado: la próxima recarga entra
        asignada sola.
      </p>
    </div>
  </BaseDialog>
</template>
