<script setup>
/**
 * Fusiona dos o más clientes en uno solo.
 *
 * El nombre final NO se deduce: se elige entre los de los implicados o se
 * escribe uno nuevo, porque un apodo ("Cheila 2") puede ser justo lo que había
 * que quitar. Los números no se pierden: pasan al principal y cada uno conserva
 * su nombre propio en `etiqueta` (lo hace el motor de fusión), que es lo que
 * permite seguir leyendo "Cheila 2 · Cheila" en Recargas.
 *
 * Esta capa solo valida y emite; la transacción vive en `useClientes`.
 */
const abierta = defineModel({ type: Boolean, default: false })

const props = defineProps({
  clientes: { type: Array, default: () => [] },
  /** Filas de `clientes_telefonos`, para enseñar qué números se mueven. */
  telefonos: { type: Array, default: () => [] },
  /** IDs con los que abrir el diálogo ya marcados (acción desde una fila). */
  preseleccion: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false }
})

const emit = defineEmits(['fusionar'])

const ids = ref([])
const nombreElegido = ref('')
const nombreOtro = ref('')

const OTRO = '__otro__'

watch(abierta, (v) => {
  if (!v) return
  ids.value = [...props.preseleccion]
  nombreElegido.value = ''
  nombreOtro.value = ''
})

const opciones = computed(() =>
  [...props.clientes]
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    .map(c => ({ label: c.nombre, value: c.id }))
)

const elegidos = computed(() => props.clientes.filter(c => ids.value.includes(c.id)))

const nombres = computed(() => [...new Set(elegidos.value.map(c => c.nombre))])

// Si el nombre marcado desaparece de la selección, se vuelve a preguntar.
watch(nombres, (lista) => {
  if (nombreElegido.value !== OTRO && !lista.includes(nombreElegido.value)) {
    nombreElegido.value = ''
  }
})

const nombreFinal = computed(() => {
  if (nombreElegido.value === OTRO) return nombreOtro.value.trim()
  return (nombreElegido.value || '').trim()
})

const puedeFusionar = computed(() => ids.value.length >= 2 && !!nombreFinal.value)

function telefonosDe(clienteId) {
  return props.telefonos.filter(t => t.clienteId === clienteId && t.activo !== false)
}

function confirmar() {
  if (!puedeFusionar.value) return
  emit('fusionar', { ids: [...ids.value], nombreFinal: nombreFinal.value })
}
</script>

<template>
  <BaseDialog
    v-model="abierta"
    title="Fusionar clientes"
    description="Unifica dos o más clientes que son la misma persona."
    confirm-text="Fusionar"
    :loading="loading"
    :disabled-guardar="!puedeFusionar"
    @confirm="confirmar"
    @cancel="abierta = false"
  >
    <div class="space-y-4">
      <UFormField label="Clientes a fusionar" required>
        <USelectMenu
          v-model="ids"
          :items="opciones"
          value-key="value"
          label-key="label"
          multiple
          placeholder="Elige al menos dos clientes"
          class="w-full"
        />
      </UFormField>

      <div
        v-if="elegidos.length"
        class="space-y-2 rounded-lg border border-default p-2"
      >
        <div
          v-for="c in elegidos"
          :key="c.id"
          class="text-sm"
        >
          <p class="font-medium">
            {{ c.nombre }}
          </p>
          <div class="mt-0.5 flex flex-wrap gap-1">
            <UBadge
              v-for="t in telefonosDe(c.id)"
              :key="t.id"
              size="sm"
              variant="soft"
              color="primary"
              class="font-mono"
              :label="t.etiqueta ? `${t.telefono} · ${t.etiqueta}` : t.telefono"
            />
            <span
              v-if="!telefonosDe(c.id).length"
              class="text-xs text-muted"
            >
              sin números
            </span>
          </div>
        </div>
      </div>

      <UFormField
        v-if="elegidos.length >= 2"
        label="Nombre del cliente final"
        required
        :error="!nombreFinal ? 'Elige o escribe un nombre' : undefined"
      >
        <div class="space-y-2">
          <URadioGroup
            v-model="nombreElegido"
            :items="[...nombres.map(n => ({ label: n, value: n })), { label: 'Otro nombre…', value: OTRO }]"
          />
          <UInput
            v-if="nombreElegido === OTRO"
            v-model="nombreOtro"
            placeholder="Nombre definitivo"
            class="w-full"
          />
        </div>
      </UFormField>

      <UAlert
        v-if="elegidos.length >= 2"
        color="warning"
        variant="soft"
        icon="i-lucide-triangle-alert"
        title="Esto no se puede deshacer desde la app"
        description="Los clientes absorbidos dejarán de aparecer en la lista. Sus números pasan al cliente final con el nombre que tenían, y sus recargas y deudas se re-apuntan al final."
      />
    </div>
  </BaseDialog>
</template>
