<template>
  <div class="space-y-4">
    <div class="flex gap-2 items-end">
      <UFormField label="Cliente" class="flex-1">
        <USelectMenu
          v-model="model.clienteId"
          :items="clientes"
          value-key="id"
          label-key="nombre"
          placeholder="Seleccionar cliente..."
          class="w-full"
        />
      </UFormField>
      <UButton
        v-if="!editar"
        icon="i-lucide-plus"
        size="sm"
        variant="outline"
        @click="showCrearCliente = true"
      />
    </div>

    <BaseDialog
      v-model="showCrearCliente"
      title="Nuevo cliente"
      confirm-text="Crear"
      @confirm="confirmarCrearCliente"
      @cancel="showCrearCliente = false"
    >
      <BaseForm
        ref="formRef"
        v-model="nuevoCliente"
        :fields="clienteFields"
        :schema="usuarioSchema"
      />
    </BaseDialog>

    <UFormField label="Monto transferido" required>
      <BaseInputNumber v-model="model.monto" placeholder="0" />
    </UFormField>
  </div>
</template>

<script setup>
import { usuarioSchema } from '../../../shared/schemas/usuario'

defineProps({
  clientes: { type: Array, default: () => [] },
  editar: { type: Boolean, default: false }
})

const model = defineModel({ type: Object, required: true })
const emit = defineEmits(['crear-cliente'])

const showCrearCliente = ref(false)
const nuevoCliente = ref({ nombre: '' })
const formRef = ref(null)

const clienteFields = [
  { name: 'nombre', label: 'Nombre', type: 'text', required: true, placeholder: 'Nombre completo', props: { class: 'w-full', maxlength: 100 } }
]

async function confirmarCrearCliente() {
  try {
    await formRef.value?.validate()
  } catch {
    return
  }
  emit('crear-cliente', { nombre: (nuevoCliente.value.nombre || '').trim() })
  showCrearCliente.value = false
  nuevoCliente.value = { nombre: '' }
}
</script>
