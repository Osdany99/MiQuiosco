<script setup>
definePageMeta({
  layout: 'admin',
  middleware: ['super-admin']
})

const toast = useToast()
const cargando = ref(false)
const errorCarga = ref(null)
const filas = ref([])
const filtroEstado = ref('abierto')

async function cargar() {
  cargando.value = true
  errorCarga.value = null
  try {
    const query = filtroEstado.value === 'todos' ? {} : { estado: filtroEstado.value }
    filas.value = await $fetch('/api/admin/voz/eventos', { query })
  } catch (e) {
    errorCarga.value = e?.message || 'Error al cargar eventos de voz.'
  } finally {
    cargando.value = false
  }
}

async function marcar(id, estado) {
  try {
    await $fetch(`/api/admin/voz/eventos/${id}`, { method: 'PATCH', body: { estado } })
    toast.add({ title: 'Voz', description: `Marcado como ${estado}.`, color: 'success' })
    await cargar()
  } catch (e) {
    toast.add({ title: 'Voz', description: e?.message || 'Error', color: 'error' })
  }
}

onMounted(cargar)
watch(filtroEstado, cargar)

const columnas = [
  'plantilla', 'comando', 'motivo', 'puestoNombre', 'intentos', 'estado', 'ultimoEn', 'acciones'
]
</script>

<template>
  <section class="p-4 md:p-6 space-y-4">
    <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <h1 class="text-xl font-semibold">
        Eventos de voz no reconocidos
      </h1>
      <USelect
        v-model="filtroEstado"
        :options="[
          { label: 'Abiertos', value: 'abierto' },
          { label: 'Resueltos', value: 'resuelto' },
          { label: 'Descartados', value: 'descartado' },
          { label: 'Todos', value: 'todos' }
        ]"
        class="w-48"
      />
    </div>

    <div v-if="errorCarga" class="text-error">
      {{ errorCarga }}
    </div>
    <div v-else-if="cargando" class="opacity-60">
      Cargando…
    </div>
    <div v-else class="overflow-x-auto">
      <table class="min-w-full text-sm">
        <thead>
          <tr class="text-left border-b border-gray-200">
            <th class="py-2 pr-4">
              Plantilla
            </th>
            <th class="py-2 pr-4">
              Comando
            </th>
            <th class="py-2 pr-4">
              Motivo
            </th>
            <th class="py-2 pr-4">
              Puesto
            </th>
            <th class="py-2 pr-4">
              Intentos
            </th>
            <th class="py-2 pr-4">
              Estado
            </th>
            <th class="py-2 pr-4">
              Último
            </th>
            <th class="py-2 pr-4">
              Acciones
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="fila in filas" :key="fila.id" class="border-b border-gray-100">
            <td class="py-2 pr-4 font-mono text-xs">
              {{ fila.plantilla || '—' }}
            </td>
            <td class="py-2 pr-4">
              {{ fila.comando }}
            </td>
            <td class="py-2 pr-4">
              {{ fila.motivo }}
            </td>
            <td class="py-2 pr-4">
              {{ fila.puestoNombre || fila.puestoId }}
            </td>
            <td class="py-2 pr-4">
              {{ fila.intentos }}
            </td>
            <td class="py-2 pr-4">
              {{ fila.estado }}
            </td>
            <td class="py-2 pr-4">
              {{ fila.ultimoEn }}
            </td>
            <td class="py-2 pr-4 flex gap-1">
              <UButton size="xs" color="primary" :to="`/admin/voz-lexico?valor=${encodeURIComponent(fila.plantilla || '')}`">
                Usar plantilla
              </UButton>
              <UButton size="xs" color="success" @click="marcar(fila.id, 'resuelto')">
                Resolver
              </UButton>
              <UButton size="xs" color="error" @click="marcar(fila.id, 'descartado')">
                Descartar
              </UButton>
              <UButton size="xs" color="neutral" @click="marcar(fila.id, 'abierto')">
                Reabrir
              </UButton>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="!filas.length" class="py-4 text-sm opacity-60">
        Sin eventos.
      </div>
    </div>
  </section>
</template>
