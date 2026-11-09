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

const opcionesEstado = [
  { label: 'Abiertos', value: 'abierto' },
  { label: 'Resueltos', value: 'resuelto' },
  { label: 'Descartados', value: 'descartado' },
  { label: 'Todos', value: 'todos' }
]

const columnas = [
  { accessorKey: 'plantilla', header: 'Plantilla' },
  { accessorKey: 'comando', header: 'Comando' },
  { accessorKey: 'motivo', header: 'Motivo' },
  { accessorKey: 'puestoNombre', header: 'Puesto' },
  { accessorKey: 'intentos', header: 'Intentos' },
  { accessorKey: 'estado', header: 'Estado' },
  { accessorKey: 'ultimoEn', header: 'Último' },
  { accessorKey: 'acciones', header: '' }
]

function etiquetaEstado(estado) {
  const valor = String(estado ?? 'abierto')
  if (valor === 'resuelto') return 'Resuelto'
  if (valor === 'descartado') return 'Descartado'
  return 'Abierto'
}

function colorEstado(estado) {
  const valor = String(estado ?? 'abierto')
  if (valor === 'resuelto') return 'success'
  if (valor === 'descartado') return 'neutral'
  return 'warning'
}

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
</script>

<template>
  <BaseHeaderPage
    title="Eventos de voz no reconocidos"
    description="Comandos que el intérprete no pudo resolver, agrupados por plantilla"
    leading-icon="i-lucide-mic-off"
    :show-button="false"
  >
    <template #trailing>
      <span class="text-sm text-muted">{{ filas.length }} eventos</span>
      <UButton
        icon="i-lucide-refresh-cw"
        variant="outline"
        label="Actualizar"
        :loading="cargando"
        @click="cargar"
      />
    </template>

    <UAlert
      v-if="errorCarga"
      color="error"
      variant="soft"
      icon="i-lucide-alert-circle"
      :title="errorCarga"
    />

    <BaseTable
      :data="filas"
      :columns="columnas"
      :loading-prop="cargando"
      :show-edit="false"
      :show-delete="false"
      empty-state="No hay eventos de voz que coincidan"
      @reload="cargar"
    >
      <template #toolbar-leading>
        <USelect
          v-model="filtroEstado"
          :items="opcionesEstado"
          size="sm"
          class="w-40"
        />
      </template>

      <template #plantilla-cell="{ row }">
        <span class="font-mono text-xs">{{ row.original.plantilla || '—' }}</span>
      </template>

      <template #comando-cell="{ row }">
        {{ row.original.comando }}
      </template>

      <template #motivo-cell="{ row }">
        {{ row.original.motivo }}
      </template>

      <template #puestoNombre-cell="{ row }">
        {{ row.original.puestoNombre || row.original.puestoId || '—' }}
      </template>

      <template #intentos-cell="{ row }">
        <UBadge
          color="neutral"
          variant="soft"
          size="sm"
          :label="String(row.original.intentos)"
        />
      </template>

      <template #estado-cell="{ row }">
        <UBadge
          :color="colorEstado(row.original.estado)"
          variant="soft"
          size="sm"
          :label="etiquetaEstado(row.original.estado)"
        />
      </template>

      <template #ultimoEn-cell="{ row }">
        <span class="text-sm">{{ fmtFechaHora(row.original.ultimoEn) }}</span>
      </template>

      <template #acciones-cell="{ row }">
        <div class="flex flex-wrap justify-end gap-1">
          <UButton
            size="xs"
            color="primary"
            variant="soft"
            icon="i-lucide-list-plus"
            label="Usar plantilla"
            :to="`/admin/voz-lexico?valor=${encodeURIComponent(row.original.plantilla || '')}`"
          />
          <UButton
            size="xs"
            color="success"
            variant="soft"
            icon="i-lucide-check"
            label="Resolver"
            @click="marcar(row.original.id, 'resuelto')"
          />
          <UButton
            size="xs"
            color="error"
            variant="soft"
            icon="i-lucide-x"
            label="Descartar"
            @click="marcar(row.original.id, 'descartado')"
          />
          <UButton
            size="xs"
            color="neutral"
            variant="soft"
            icon="i-lucide-rotate-ccw"
            label="Reabrir"
            @click="marcar(row.original.id, 'abierto')"
          />
        </div>
      </template>
    </BaseTable>
  </BaseHeaderPage>
</template>
