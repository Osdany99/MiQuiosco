<script setup>
import { TIPOS_FALLO_SYNC } from '#shared/syncFallos'
import { SYNC_TABLES } from '#shared/tables'

definePageMeta({
  layout: 'admin',
  middleware: ['super-admin']
})

const api = useAdminApi()
const toast = useToast()

const filtros = ref({
  puestoId: 'todos',
  estado: 'abierto',
  tipo: 'todos',
  tabla: 'todos'
})

const filas = ref([])
const totalRegistros = ref(0)
const cargando = ref(false)
const errorCarga = ref(null)
const puestos = ref([])

const estados = [
  { label: 'Abiertos', value: 'abierto' },
  { label: 'Resueltos', value: 'resuelto' },
  { label: 'Todos', value: 'todos' }
]

const tipos = [
  { label: 'Todos los tipos', value: 'todos' },
  ...TIPOS_FALLO_SYNC.map(tipo => ({ label: etiquetaFallo(tipo), value: tipo }))
]

const tablas = [
  { label: 'Todas las tablas', value: 'todos' },
  ...SYNC_TABLES.map(tabla => ({ label: tabla.tabla, value: tabla.tabla }))
]

const opcionesPuesto = computed(() => [
  { label: 'Todos los puestos', value: 'todos' },
  ...puestos.value.map(puesto => ({ label: puesto.nombre, value: puesto.id }))
])

const columnas = [
  { accessorKey: 'ultimoEn', header: 'Último' },
  { accessorKey: 'puestoNombre', header: 'Puesto' },
  { accessorKey: 'dispositivoNombre', header: 'Dispositivo' },
  { accessorKey: 'tipo', header: 'Tipo' },
  { accessorKey: 'origen', header: 'Origen' },
  { accessorKey: 'detalle', header: 'Motivo' },
  { accessorKey: 'intentos', header: 'Intentos' },
  { accessorKey: 'estado', header: 'Estado' },
  { accessorKey: 'acciones', header: '' }
]

function colorTipo(tipo) {
  if (tipo === 'push_rechazo') return 'warning'
  if (tipo === 'sync_error' || tipo === 'pull_error') return 'error'
  return 'neutral'
}

function idCorto(valor) {
  if (!valor) return ''
  const texto = String(valor)
  return texto.length > 10 ? `${texto.slice(0, 8)}…` : texto
}

async function cargar() {
  cargando.value = true
  errorCarga.value = null
  try {
    const resultado = await api.listarFallos({
      puestoId: filtros.value.puestoId === 'todos' ? undefined : filtros.value.puestoId,
      estado: filtros.value.estado === 'todos' ? undefined : filtros.value.estado,
      tipo: filtros.value.tipo === 'todos' ? undefined : filtros.value.tipo,
      tabla: filtros.value.tabla === 'todos' ? undefined : filtros.value.tabla,
      limit: 200
    })
    filas.value = resultado.fallos
    totalRegistros.value = resultado.total
  } catch (err) {
    errorCarga.value = err.message
  } finally {
    cargando.value = false
  }
}

async function cargarPuestos() {
  try {
    puestos.value = await api.listarPuestos()
  } catch {
    // El selector es secundario: la tabla ya muestra el error de carga.
  }
}

onMounted(() => {
  cargarPuestos()
  cargar()
})

watch(filtros, cargar, { deep: true })

// --- Detalle y resolución ---
const dialogoDetalle = ref(false)
const detalle = ref(null)
const notaDetalle = ref('')
const guardando = ref(false)

function abrirDetalle(fallo) {
  detalle.value = fallo
  notaDetalle.value = fallo.nota ?? ''
  dialogoDetalle.value = true
}

async function cambiarEstado() {
  if (!detalle.value) return
  const resuelto = !detalle.value.resueltoEn

  guardando.value = true
  try {
    const actualizado = await api.actualizarFallo(detalle.value.id, {
      resuelto,
      nota: notaDetalle.value.trim() || null
    })

    detalle.value = {
      ...detalle.value,
      resueltoEn: actualizado.resueltoEn,
      resueltoPor: actualizado.resueltoPor,
      nota: actualizado.nota
    }
    notaDetalle.value = actualizado.nota ?? ''

    toast.add({
      title: resuelto ? 'Fallo marcado como resuelto' : 'Fallo reabierto',
      color: 'success',
      icon: 'i-lucide-check'
    })
    await cargar()
  } catch (err) {
    toast.add({ title: 'No se pudo actualizar el fallo', description: err.message, color: 'error' })
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <BaseHeaderPage
    title="Fallos de sincronización"
    description="Errores que reportan los dispositivos al sincronizar"
    leading-icon="i-lucide-triangle-alert"
    :show-button="false"
  >
    <template #trailing>
      <span class="text-sm text-muted">{{ totalRegistros }} fallos</span>
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
      empty-state="No hay fallos que coincidan"
      @reload="cargar"
    >
      <template #toolbar-leading>
        <USelect
          v-model="filtros.puestoId"
          :items="opcionesPuesto"
          size="sm"
          class="w-40"
        />
        <USelect
          v-model="filtros.estado"
          :items="estados"
          size="sm"
          class="w-32"
        />
        <USelect
          v-model="filtros.tipo"
          :items="tipos"
          size="sm"
          class="w-36"
        />
        <USelect
          v-model="filtros.tabla"
          :items="tablas"
          size="sm"
          class="w-36"
        />
      </template>

      <template #ultimoEn-cell="{ row }">
        <span class="text-sm">{{ fmtFechaHora(row.original.ultimoEn) }}</span>
      </template>

      <template #puestoNombre-cell="{ row }">
        {{ row.original.puestoNombre || '—' }}
      </template>

      <template #dispositivoNombre-cell="{ row }">
        {{ row.original.dispositivoNombre || '—' }}
      </template>

      <template #tipo-cell="{ row }">
        <UBadge
          :color="colorTipo(row.original.tipo)"
          variant="soft"
          size="sm"
          :label="etiquetaFallo(row.original.tipo)"
        />
      </template>

      <template #origen-cell="{ row }">
        <div class="text-sm">
          <span class="font-mono">{{ row.original.tabla || '—' }}</span>
          <span v-if="row.original.registroId" class="text-xs text-muted">
            · {{ idCorto(row.original.registroId) }}
          </span>
        </div>
        <p v-if="row.original.fase" class="text-xs text-muted">
          Fase {{ row.original.fase }}
        </p>
      </template>

      <template #detalle-cell="{ row }">
        <div class="max-w-72">
          <p v-if="row.original.motivo" class="text-sm font-medium">
            {{ etiquetaFallo(row.original.motivo) }}
          </p>
          <p class="line-clamp-2 text-xs text-muted">
            {{ row.original.mensaje || 'Sin mensaje' }}
          </p>
        </div>
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
          :color="row.original.resueltoEn ? 'success' : 'warning'"
          variant="soft"
          size="sm"
          :label="row.original.resueltoEn ? 'Resuelto' : 'Abierto'"
        />
      </template>

      <template #acciones-cell="{ row }">
        <div class="flex justify-end gap-1">
          <UTooltip text="Ver detalle" :delay-duration="0">
            <UButton
              icon="i-lucide-eye"
              size="xs"
              color="neutral"
              variant="ghost"
              aria-label="Ver detalle"
              @click="abrirDetalle(row.original)"
            />
          </UTooltip>
        </div>
      </template>
    </BaseTable>

    <BaseDialog
      v-model="dialogoDetalle"
      title="Detalle del fallo"
      :ui="{ content: 'sm:max-w-2xl' }"
      :hide-confirm="true"
      :loading="guardando"
      cancel-text="Cerrar"
      @cancel="dialogoDetalle = false"
    >
      <div v-if="detalle" class="space-y-4">
        <dl class="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt class="text-muted">
              Puesto
            </dt>
            <dd class="font-medium">
              {{ detalle.puestoNombre || '—' }}
            </dd>
          </div>
          <div>
            <dt class="text-muted">
              Dispositivo
            </dt>
            <dd class="font-medium">
              {{ detalle.dispositivoNombre || '—' }}
            </dd>
          </div>
          <div>
            <dt class="text-muted">
              Tipo / fase
            </dt>
            <dd>{{ etiquetaFallo(detalle.tipo) }} · {{ detalle.fase || '—' }}</dd>
          </div>
          <div>
            <dt class="text-muted">
              Tabla / registro
            </dt>
            <dd class="break-all font-mono text-xs">
              {{ detalle.tabla || '—' }} {{ detalle.registroId ? `· ${detalle.registroId}` : '' }}
            </dd>
          </div>
          <div>
            <dt class="text-muted">
              Código HTTP / motivo
            </dt>
            <dd>{{ detalle.codigoHttp ?? '—' }} · {{ etiquetaFallo(detalle.motivo) }}</dd>
          </div>
          <div>
            <dt class="text-muted">
              Intentos
            </dt>
            <dd>{{ detalle.intentos }}</dd>
          </div>
          <div>
            <dt class="text-muted">
              Primera vez
            </dt>
            <dd>{{ fmtFechaHora(detalle.creadoEn) }}</dd>
          </div>
          <div>
            <dt class="text-muted">
              Última vez
            </dt>
            <dd>{{ fmtFechaHora(detalle.ultimoEn) }}</dd>
          </div>
          <div v-if="detalle.loteId">
            <dt class="text-muted">
              Lote
            </dt>
            <dd class="break-all font-mono text-xs">
              {{ detalle.loteId }}
            </dd>
          </div>
          <div v-if="detalle.appVersion || detalle.dispositivo">
            <dt class="text-muted">
              APK reportada
            </dt>
            <dd>{{ detalle.appVersion || '—' }} {{ detalle.dispositivo ? `· ${detalle.dispositivo}` : '' }}</dd>
          </div>
        </dl>

        <div>
          <p class="mb-1 text-sm text-muted">
            Mensaje
          </p>
          <pre class="max-h-40 overflow-auto rounded-md bg-elevated p-3 text-xs whitespace-pre-wrap break-words">{{ detalle.mensaje || 'Sin mensaje' }}</pre>
        </div>

        <div v-if="detalle.fila">
          <p class="mb-1 text-sm text-muted">
            Fila rechazada (redactada)
          </p>
          <pre class="max-h-48 overflow-auto rounded-md bg-elevated p-3 text-xs">{{ textoJson(detalle.fila) }}</pre>
        </div>

        <div v-if="detalle.contexto">
          <p class="mb-1 text-sm text-muted">
            Contexto
          </p>
          <pre class="max-h-48 overflow-auto rounded-md bg-elevated p-3 text-xs">{{ textoJson(detalle.contexto) }}</pre>
        </div>

        <UFormField label="Nota de resolución" hint="Se guarda al cerrar o reabrir el fallo.">
          <UTextarea
            v-model="notaDetalle"
            placeholder="Ej. Se corrigió el producto duplicado en la APK"
            :rows="2"
            maxlength="500"
            class="w-full"
          />
        </UFormField>

        <p v-if="detalle.resueltoEn" class="text-xs text-muted">
          Resuelto {{ fmtFechaHora(detalle.resueltoEn) }}.
        </p>
      </div>

      <template #actions>
        <UButton
          v-if="detalle"
          :icon="detalle.resueltoEn ? 'i-lucide-rotate-ccw' : 'i-lucide-check'"
          :label="detalle.resueltoEn ? 'Reabrir' : 'Marcar resuelto'"
          size="sm"
          :color="detalle.resueltoEn ? 'warning' : 'success'"
          :loading="guardando"
          @click="cambiarEstado"
        />
      </template>
    </BaseDialog>
  </BaseHeaderPage>
</template>
