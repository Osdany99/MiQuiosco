<template>
  <BaseDialog
    v-model="isOpen"
    title="Nuevo cliente"
    description="Se crea en este puesto. Puedes corregir el nombre antes de guardar."
    confirm-text="Agregar cliente"
    :loading="guardando"
    :disabled-guardar="!valida"
    @confirm="confirmar"
    @cancel="isOpen = false"
  >
    <div class="space-y-4">
      <UFormField label="Nombre" required>
        <UInput
          v-model="form.nombre"
          placeholder="Nombre del cliente"
          maxlength="80"
          class="w-full"
        />
      </UFormField>
      <UFormField label="Notas (opcional)">
        <UInput
          v-model="form.notas"
          placeholder="Teléfono, dirección, referencia..."
          maxlength="120"
          class="w-full"
        />
      </UFormField>
      <p v-if="errorNombre" class="text-sm text-error font-medium">
        {{ errorNombre }}
      </p>
    </div>
  </BaseDialog>
</template>

<script setup>
/**
 * Alta de cliente por voz (Fase P3). La voz solo prellena el nombre; el cliente
 * no existe hasta pulsar «Agregar cliente» (o decir «sí», que pulsa lo mismo).
 */
const props = defineProps({
  prefill: { type: Object, default: null }
})
const isOpen = defineModel({ type: Boolean, default: false })
const emit = defineEmits(['guardado'])

const toast = useToast()
const auth = useAuth()
const clientesApi = useClientes()

const form = ref({ nombre: '', notas: '' })
const guardando = ref(false)

const errorNombre = computed(() => {
  const nombre = String(form.value.nombre ?? '').trim()
  if (!nombre) return 'El nombre es obligatorio'
  if (nombre.length < 2) return 'Nombre demasiado corto'
  return null
})
const valida = computed(() => !errorNombre.value)

watch(isOpen, (open) => {
  if (!open) return
  const dicho = String(props.prefill?.nombre ?? '').trim()
  form.value = { nombre: dicho, notas: '' }
})

async function confirmar() {
  if (!valida.value) return
  const pid = auth.usuarioActual.value?.puestoId
  if (!pid) {
    toast.add({ title: 'Clientes', description: 'Sin puesto asignado.', color: 'error' })
    return
  }
  guardando.value = true
  try {
    const nombre = form.value.nombre.trim()
    await clientesApi.crearCliente({ nombre, notas: form.value.notas.trim() || null }, pid)
    toast.add({ title: 'Cliente agregado', description: nombre, color: 'success' })
    isOpen.value = false
    emit('guardado')
  } catch (e) {
    toast.add({ title: 'Clientes', description: e?.message || 'No se pudo crear.', color: 'error' })
  } finally {
    guardando.value = false
  }
}

// La confirmación hablada pulsa este mismo botón.
defineExpose({ confirmar })
</script>
