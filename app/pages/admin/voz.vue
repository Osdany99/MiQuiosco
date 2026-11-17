<script setup>
import { computed } from 'vue'

definePageMeta({
  layout: 'admin',
  middleware: ['super-admin']
})

const toast = useToast()
const api = useAdminApi()
const cargando = ref(false)
const errorCarga = ref(null)
const limpiando = ref(false)
const confirmarDepurar = ref(false)
// La retención la fija el super admin en la config de flota: el diálogo la lee
// en vez de prometer 30 días fijos.
const retencionDias = ref(null)

async function cargarRetencion() {
  try {
    const respuesta = await api.obtenerConfigVoz()
    const dias = Number(respuesta?.config?.retencionDias)
    retencionDias.value = Number.isFinite(dias) && dias > 0 ? dias : null
  } catch {
    retencionDias.value = null
  }
}
const diasDepuracion = computed(() => retencionDias.value ?? 30)

async function limpiarAntiguos() {
  confirmarDepurar.value = false
  limpiando.value = true
  try {
    await api.limpiarEventosVoz()
    toast.add({ title: 'Voz', description: 'Eventos antiguos depurados.', color: 'success' })
    await cargar()
  } catch (e) {
    toast.add({ title: 'Error', description: e?.message || 'No se pudo limpiar.', color: 'error' })
  } finally {
    limpiando.value = false
  }
}
const filas = ref([])
const filtroEstado = ref('abierto')
/** Salud del módulo: última telemetría y proofs recientes. */
const resumen = ref(null)

async function cargarResumen() {
  try {
    resumen.value = await api.resumenVoz()
  } catch {
    resumen.value = null
  }
}

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
    filas.value = await api.listarEventosVoz(query)
    void cargarResumen()
  } catch (e) {
    errorCarga.value = e?.message || 'Error al cargar eventos de voz.'
  } finally {
    cargando.value = false
  }
}

async function marcar(id, estado) {
  try {
    await api.marcarEventoVoz(id, estado)
    toast.add({ title: 'Voz', description: `Marcado como ${estado}.`, color: 'success' })
    await cargar()
  } catch (e) {
    toast.add({ title: 'Voz', description: e?.message || 'Error', color: 'error' })
  }
}

onMounted(() => {
  void cargar()
  void cargarRetencion()
})
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
        to="/admin/voz-confirmaciones"
        icon="i-lucide-shield-check"
        variant="outline"
        label="Confirmaciones"
      />
      <UButton
        icon="i-lucide-trash-2"
        variant="outline"
        label="Depurar"
        color="warning"
        :loading="limpiando"
        @click="confirmarDepurar = true"
      />
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

    <div v-if="resumen" class="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
      <span class="flex items-center gap-1">
        <UIcon name="i-lucide-activity" class="size-4" />
        Último evento: {{ resumen.eventos.ultimoEn ? fmtFechaHora(resumen.eventos.ultimoEn) : 'nunca' }}
      </span>
      <span class="flex items-center gap-1">
        <UIcon name="i-lucide-inbox" class="size-4" />
        {{ resumen.eventos.abiertos }} abiertos de {{ resumen.eventos.total }}
      </span>
      <span class="flex items-center gap-1">
        <UIcon name="i-lucide-shield-check" class="size-4" />
        {{ resumen.confirmaciones.ultimos7d }} confirmaciones en 7 días
        <span v-if="resumen.confirmaciones.ultimaEn">· última {{ fmtFechaHora(resumen.confirmaciones.ultimaEn) }}</span>
      </span>
    </div>

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
            :to="`/admin/voz-lexico?plantilla=${encodeURIComponent(row.original.plantilla || '')}`"
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

    <BaseDialog
      v-model="confirmarDepurar"
      title="Depurar eventos antiguos"
      :description="`Se eliminan los eventos con más de ${diasDepuracion} días y menos de 3 intentos.`"
      confirm-text="Depurar"
      confirm-color="warning"
      :loading="limpiando"
      @confirm="limpiarAntiguos"
    >
      <p class="text-sm text-muted">
        La operación no se puede deshacer. Los eventos con muchos intentos o
        recientes se conservan.
      </p>
    </BaseDialog>
  </BaseHeaderPage>
</template>
