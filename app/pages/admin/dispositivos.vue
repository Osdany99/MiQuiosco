<script setup>
definePageMeta({
  layout: 'admin',
  middleware: ['super-admin']
})

const api = useAdminApi()
const route = useRoute()
const toast = useToast()

// El atajo «Ver dispositivos» de /admin/puestos llega con ?puestoId=...
const puestoInicial = typeof route.query.puestoId === 'string' ? route.query.puestoId : 'todos'

const filtros = ref({
  puestoId: puestoInicial || 'todos',
  estado: 'todos',
  q: ''
})

const filas = ref([])
const totalRegistros = ref(0)
const cargando = ref(false)
const errorCarga = ref(null)

const puestos = ref([])

const estados = [
  { label: 'Todos', value: 'todos' },
  { label: 'Activos', value: 'activos' },
  { label: 'Revocados', value: 'revocados' }
]

const opcionesPuesto = computed(() => [
  { label: 'Todos los puestos', value: 'todos' },
  ...puestos.value.map(puesto => ({ label: puesto.nombre, value: puesto.id }))
])

const columnas = [
  { accessorKey: 'nombre', header: 'Dispositivo' },
  { accessorKey: 'puestoNombre', header: 'Puesto' },
  { accessorKey: 'usuarios', header: 'Usuarios' },
  { accessorKey: 'ultimaConexionEn', header: 'Última conexión' },
  { accessorKey: 'ultimaSyncOkEn', header: 'Última sync' },
  { accessorKey: 'pendientes', header: 'Pendientes' },
  { accessorKey: 'revocado', header: 'Estado', cell: 'boolean', labelTrue: 'Revocado', labelFalse: 'Activo', colorTrue: 'error', colorFalse: 'success' },
  { accessorKey: 'acciones', header: '' }
]

async function cargar() {
  cargando.value = true
  errorCarga.value = null
  try {
    const resultado = await api.listarDispositivos({
      puestoId: filtros.value.puestoId === 'todos' ? undefined : filtros.value.puestoId,
      revocado: filtros.value.estado === 'todos' ? undefined : filtros.value.estado === 'revocados',
      q: filtros.value.q.trim() || undefined,
      limit: 300
    })
    filas.value = resultado.dispositivos
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
    // El selector de puestos es secundario: si falla, la lista principal ya
    // mostrará el error de carga.
  }
}

onMounted(() => {
  cargarPuestos()
  cargar()
})

watch(() => [filtros.value.puestoId, filtros.value.estado], cargar)
watchDebounced(() => filtros.value.q, cargar, { debounce: 400 })

// --- Detalle y accesos ---
const dialogoDetalle = ref(false)
const detalle = ref(null)
const cargandoDetalle = ref(false)
const errorDetalle = ref(null)

const columnasAccesos = [
  { accessorKey: 'creadoEn', header: 'Fecha' },
  { accessorKey: 'tipo', header: 'Tipo' },
  { accessorKey: 'usuarioNombre', header: 'Usuario' },
  { accessorKey: 'appVersion', header: 'Versión' },
  { accessorKey: 'ip', header: 'IP' }
]

async function abrirDetalle(dispositivo) {
  detalle.value = { ...dispositivo, accesos: [] }
  errorDetalle.value = null
  dialogoDetalle.value = true
  cargandoDetalle.value = true
  try {
    detalle.value = await api.obtenerDispositivo(dispositivo.id)
  } catch (err) {
    errorDetalle.value = err.message
  } finally {
    cargandoDetalle.value = false
  }
}

function etiquetaAcceso(tipo) {
  const etiquetas = { activacion: 'Activación', login: 'Inicio', logout: 'Cierre' }
  return etiquetas[tipo] ?? tipo
}

// --- Renombrar ---
const dialogoRenombrar = ref(false)
const dispositivoEditando = ref(null)
const errorRenombrar = ref(null)
const formNombre = ref({ nombre: '' })

const camposNombre = [
  { name: 'nombre', label: 'Nombre del equipo', type: 'text', placeholder: 'Ej. Caja 1', props: { maxlength: 80 } }
]

function abrirRenombrar(dispositivo) {
  dispositivoEditando.value = dispositivo
  formNombre.value = { nombre: dispositivo.nombre ?? '' }
  errorRenombrar.value = null
  dialogoDetalle.value = false
  dialogoRenombrar.value = true
}

// --- Revocar / restaurar ---
const dialogoRevocar = ref(false)
const guardando = ref(false)
const revocadoDestino = ref(false)

function abrirRevocar(dispositivo) {
  dispositivoEditando.value = dispositivo
  revocadoDestino.value = !dispositivo.revocado
  dialogoDetalle.value = false
  dialogoRevocar.value = true
}

async function guardarNombre() {
  errorRenombrar.value = null
  guardando.value = true
  try {
    await api.actualizarDispositivo(dispositivoEditando.value.id, {
      nombre: formNombre.value.nombre.trim() || null
    })
    toast.add({ title: 'Dispositivo renombrado', color: 'success', icon: 'i-lucide-check' })
    dialogoRenombrar.value = false
    await cargar()
  } catch (err) {
    errorRenombrar.value = err.message
  } finally {
    guardando.value = false
  }
}

async function confirmarRevocar() {
  guardando.value = true
  try {
    await api.actualizarDispositivo(dispositivoEditando.value.id, {
      revocado: revocadoDestino.value
    })
    toast.add({
      title: revocadoDestino.value ? 'Dispositivo revocado' : 'Dispositivo restaurado',
      description: revocadoDestino.value
        ? 'Dejará de sincronizar y de poder iniciar sesión.'
        : 'Podrá volver a sincronizar con normalidad.',
      color: 'success',
      icon: 'i-lucide-check'
    })
    dialogoRevocar.value = false
    await cargar()
  } catch (err) {
    toast.add({ title: 'No se pudo actualizar', description: err.message, color: 'error' })
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <BaseHeaderPage
    title="Dispositivos"
    description="Equipos que sincronizan y las cuentas que entraron en ellos"
    leading-icon="i-lucide-smartphone"
    :show-button="false"
  >
    <template #trailing>
      <span class="text-sm text-muted">{{ totalRegistros }} equipos</span>
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
      empty-state="No hay dispositivos que coincidan"
      @reload="cargar"
    >
      <template #toolbar-leading>
        <UInput
          v-model="filtros.q"
          icon="i-lucide-search"
          placeholder="Buscar nombre o modelo"
          size="sm"
          class="w-44 sm:w-60"
        />
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
      </template>

      <template #nombre-cell="{ row }">
        <p class="font-medium">
          {{ row.original.nombre || 'Equipo sin nombre' }}
        </p>
        <p class="text-xs text-muted">
          {{ row.original.modelo || 'Modelo desconocido' }}
          <span v-if="row.original.android"> · Android {{ row.original.android }}</span>
          <span v-if="row.original.appVersion"> · APK {{ row.original.appVersion }}</span>
        </p>
      </template>

      <template #puestoNombre-cell="{ row }">
        {{ row.original.puestoNombre || '—' }}
      </template>

      <template #usuarios-cell="{ row }">
        <div v-if="row.original.usuarios?.length" class="flex flex-wrap gap-1">
          <UBadge
            v-for="usuario in row.original.usuarios"
            :key="usuario.id"
            color="neutral"
            variant="soft"
            size="sm"
            :label="usuario.nombre"
          />
        </div>
        <span v-else class="text-sm text-muted">—</span>
      </template>

      <template #ultimaConexionEn-cell="{ row }">
        <span class="text-sm">{{ fmtFechaHora(row.original.ultimaConexionEn) }}</span>
      </template>

      <template #ultimaSyncOkEn-cell="{ row }">
        <span class="text-sm">{{ fmtFechaHora(row.original.ultimaSyncOkEn) }}</span>
      </template>

      <template #pendientes-cell="{ row }">
        <UBadge
          :color="row.original.pendientes > 0 ? 'warning' : 'neutral'"
          :variant="row.original.pendientes > 0 ? 'soft' : 'outline'"
          size="sm"
          :label="String(row.original.pendientes ?? 0)"
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
          <UTooltip text="Renombrar" :delay-duration="0">
            <UButton
              icon="i-lucide-pencil"
              size="xs"
              color="neutral"
              variant="ghost"
              aria-label="Renombrar"
              @click="abrirRenombrar(row.original)"
            />
          </UTooltip>
          <UTooltip :text="row.original.revocado ? 'Restaurar' : 'Revocar'" :delay-duration="0">
            <UButton
              :icon="row.original.revocado ? 'i-lucide-rotate-ccw' : 'i-lucide-ban'"
              size="xs"
              :color="row.original.revocado ? 'primary' : 'error'"
              variant="ghost"
              :aria-label="row.original.revocado ? 'Restaurar' : 'Revocar'"
              @click="abrirRevocar(row.original)"
            />
          </UTooltip>
        </div>
      </template>
    </BaseTable>

    <BaseDialog
      v-model="dialogoDetalle"
      title="Detalle del dispositivo"
      :ui="{ content: 'sm:max-w-3xl' }"
      :hide-confirm="true"
      cancel-text="Cerrar"
      @cancel="dialogoDetalle = false"
    >
      <div v-if="cargandoDetalle" class="flex justify-center py-8">
        <UIcon name="i-lucide-loader-2" class="size-7 animate-spin text-primary" />
      </div>

      <UAlert
        v-else-if="errorDetalle"
        color="error"
        variant="soft"
        icon="i-lucide-alert-circle"
        :title="errorDetalle"
      />

      <div v-else-if="detalle" class="space-y-5">
        <dl class="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt class="text-muted">
              Nombre
            </dt>
            <dd class="font-medium">
              {{ detalle.nombre || 'Equipo sin nombre' }}
            </dd>
          </div>
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
              Modelo
            </dt>
            <dd>{{ detalle.modelo || 'Desconocido' }}</dd>
          </div>
          <div>
            <dt class="text-muted">
              Android / APK
            </dt>
            <dd>{{ detalle.android || '—' }} · {{ detalle.appVersion || '—' }}</dd>
          </div>
          <div>
            <dt class="text-muted">
              Provisionado
            </dt>
            <dd>{{ fmtFechaHora(detalle.provisionadoEn) }}</dd>
          </div>
          <div>
            <dt class="text-muted">
              Última conexión
            </dt>
            <dd>{{ fmtFechaHora(detalle.ultimaConexionEn) }}</dd>
          </div>
          <div>
            <dt class="text-muted">
              Última sync correcta
            </dt>
            <dd>{{ fmtFechaHora(detalle.ultimaSyncOkEn) }}</dd>
          </div>
          <div>
            <dt class="text-muted">
              Estado
            </dt>
            <dd>
              <UBadge
                :color="detalle.revocado ? 'error' : 'success'"
                variant="soft"
                size="sm"
                :label="detalle.revocado ? 'Revocado' : 'Activo'"
              />
            </dd>
          </div>
        </dl>

        <div>
          <h3 class="mb-2 font-semibold">
            Accesos recientes
          </h3>
          <UTable
            :data="detalle.accesos"
            :columns="columnasAccesos"
            empty="Sin accesos registrados"
          >
            <template #creadoEn-cell="{ row }">
              {{ fmtFechaHora(row.original.creadoEn) }}
            </template>
            <template #tipo-cell="{ row }">
              <UBadge
                color="neutral"
                variant="soft"
                size="sm"
                :label="etiquetaAcceso(row.original.tipo)"
              />
            </template>
            <template #usuarioNombre-cell="{ row }">
              {{ row.original.usuarioNombre || '—' }}
            </template>
            <template #appVersion-cell="{ row }">
              {{ row.original.appVersion || '—' }}
            </template>
            <template #ip-cell="{ row }">
              {{ row.original.ip || '—' }}
            </template>
          </UTable>
        </div>
      </div>

      <template #actions>
        <template v-if="detalle">
          <UButton
            icon="i-lucide-pencil"
            label="Renombrar"
            size="sm"
            variant="outline"
            @click="abrirRenombrar(detalle)"
          />
          <UButton
            :icon="detalle.revocado ? 'i-lucide-rotate-ccw' : 'i-lucide-ban'"
            :label="detalle.revocado ? 'Restaurar' : 'Revocar'"
            size="sm"
            :color="detalle.revocado ? 'primary' : 'error'"
            variant="outline"
            @click="abrirRevocar(detalle)"
          />
        </template>
      </template>
    </BaseDialog>

    <BaseDialog
      v-model="dialogoRenombrar"
      title="Renombrar dispositivo"
      description="Un nombre útil ayuda a identificar la caja o el equipo."
      confirm-text="Guardar nombre"
      :loading="guardando"
      @confirm="guardarNombre"
      @cancel="dialogoRenombrar = false"
    >
      <div class="space-y-4">
        <UAlert
          v-if="errorRenombrar"
          color="error"
          variant="soft"
          icon="i-lucide-alert-circle"
          :title="errorRenombrar"
        />
        <BaseForm v-model="formNombre" :fields="camposNombre" no-form />
      </div>
    </BaseDialog>

    <BaseDialog
      v-model="dialogoRevocar"
      :title="revocadoDestino ? 'Revocar dispositivo' : 'Restaurar dispositivo'"
      :description="revocadoDestino
        ? 'El equipo dejará de poder sincronizar e iniciar sesión.'
        : 'El equipo podrá volver a sincronizar con normalidad.'"
      :confirm-text="revocadoDestino ? 'Revocar' : 'Restaurar'"
      :confirm-color="revocadoDestino ? 'error' : 'primary'"
      :loading="guardando"
      @confirm="confirmarRevocar"
      @cancel="dialogoRevocar = false"
    >
      <UAlert
        v-if="revocadoDestino"
        color="warning"
        variant="soft"
        icon="i-lucide-triangle-alert"
        title="Los datos locales del equipo no se borran"
        description="Solo se corta el acceso al servidor. Si necesitas recuperar el equipo, podrás restaurarlo después."
      />
      <p v-else class="text-sm text-muted">
        El equipo volverá a entrar en la próxima sincronización.
      </p>
    </BaseDialog>
  </BaseHeaderPage>
</template>
