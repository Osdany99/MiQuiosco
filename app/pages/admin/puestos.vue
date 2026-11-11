<script setup>
import {
  actualizarJefeAdminSchema,
  actualizarPuestoAdminSchema,
  crearPuestoAdminSchema,
  resetPinAdminSchema
} from '#shared/schemas/admin'
import { resumenRestricciones } from '#shared/permisos'

definePageMeta({
  layout: 'admin',
  middleware: ['super-admin']
})

const api = useAdminApi()
const toast = useToast()

const filas = ref([])
const cargando = ref(false)
const errorCarga = ref(null)

const busqueda = ref('')
const filtroEstado = ref('todos')

const estados = [
  { label: 'Todos', value: 'todos' },
  { label: 'Activos', value: 'activos' },
  { label: 'Inactivos', value: 'inactivos' }
]

const columnas = [
  { accessorKey: 'nombre', header: 'Puesto' },
  { accessorKey: 'jefe', header: 'Jefe' },
  { accessorKey: 'activo', header: 'Estado', cell: 'boolean', labelTrue: 'Activo', labelFalse: 'Inactivo', colorTrue: 'success', colorFalse: 'warning' },
  { accessorKey: 'dispositivos', header: 'Dispositivos' },
  { accessorKey: 'fallosAbiertos', header: 'Fallos' },
  { accessorKey: 'ultimaSyncOkEn', header: 'Última sync' },
  { accessorKey: 'acceso', header: 'Acceso' },
  { accessorKey: 'acciones', header: '' }
]

const filtrados = computed(() => {
  const texto = busqueda.value.trim().toLowerCase()

  return filas.value.filter((puesto) => {
    if (filtroEstado.value === 'activos' && !puesto.activo) return false
    if (filtroEstado.value === 'inactivos' && puesto.activo) return false
    if (!texto) return true

    const valores = [
      puesto.nombre,
      ...(puesto.jefes ?? []).map(jefe => jefe.nombre)
    ]
    return valores.some(valor => String(valor ?? '').toLowerCase().includes(texto))
  })
})

async function cargar() {
  cargando.value = true
  errorCarga.value = null
  try {
    filas.value = await api.listarPuestos()
  } catch (err) {
    errorCarga.value = err.message
  } finally {
    cargando.value = false
  }
}

onMounted(cargar)

// --- Alta de puesto + jefe ---
const dialogoAlta = ref(false)
const guardando = ref(false)
const errorAlta = ref(null)
const formAlta = ref(vacioAlta())

const camposAlta = [
  { name: 'nombre', label: 'Nombre del puesto', type: 'text', required: true, placeholder: 'Ej. Quiosco Centro', props: { maxlength: 100 } },
  { name: 'activo', label: 'Puesto activo', type: 'switch' },
  { name: 'jefeNombre', label: 'Usuario del jefe', type: 'text', required: true, placeholder: 'Ej. maria', props: { maxlength: 100, autocapitalize: 'none' } },
  { name: 'jefePin', label: 'PIN inicial', type: 'password', required: true, placeholder: '4 a 6 dígitos', props: { inputmode: 'numeric', maxlength: 6 } },
  { name: 'jefeTelefono', label: 'Teléfono del jefe', type: 'text', placeholder: 'Opcional', props: { maxlength: 30 } },
  { name: 'jefeNotas', label: 'Notas', type: 'textarea', placeholder: 'Opcional', props: { rows: 2, maxlength: 500 } }
]

function vacioAlta() {
  return {
    nombre: '',
    activo: true,
    jefeNombre: '',
    jefePin: '',
    jefeTelefono: '',
    jefeNotas: ''
  }
}

function abrirAlta() {
  formAlta.value = vacioAlta()
  errorAlta.value = null
  dialogoAlta.value = true
}

function resumenAcceso(permisos) {
  const r = resumenRestricciones(permisos || {})
  if (r.vistasOff === 0 && r.accionesOff === 0) return 'Completo'
  return `${r.vistasOff} vistas y ${r.accionesOff} acciones ocultas`
}

async function guardarAlta() {
  errorAlta.value = null
  const parsed = crearPuestoAdminSchema.safeParse({
    nombre: formAlta.value.nombre,
    activo: formAlta.value.activo,
    jefe: {
      nombre: formAlta.value.jefeNombre,
      pin: formAlta.value.jefePin,
      telefono: formAlta.value.jefeTelefono || null,
      notas: formAlta.value.jefeNotas || null
    }
  })

  if (!parsed.success) {
    errorAlta.value = primerErrorZod(parsed)
    return
  }

  guardando.value = true
  try {
    await api.crearPuesto(parsed.data)
    toast.add({
      title: 'Puesto creado',
      description: `«${parsed.data.nombre}» ya puede entrar con el usuario ${parsed.data.jefe.nombre}.`,
      color: 'success',
      icon: 'i-lucide-check'
    })
    dialogoAlta.value = false
    await cargar()
  } catch (err) {
    errorAlta.value = err.message
  } finally {
    guardando.value = false
  }
}

// --- Edición del puesto ---
const dialogoPuesto = ref(false)
const puestoEditando = ref(null)
const errorPuesto = ref(null)
const formPuesto = ref({ nombre: '', activo: true })

const camposPuesto = computed(() => {
  const campos = [
    { name: 'nombre', label: 'Nombre del puesto', type: 'text', required: true, props: { maxlength: 100 } }
  ]
  // El puesto central aloja al super admin: desactivarlo lo dejaría fuera.
  if (!puestoEditando.value?.central) {
    campos.push({ name: 'activo', label: 'Puesto activo', type: 'switch' })
  }
  return campos
})

function abrirPuesto(puesto) {
  puestoEditando.value = puesto
  formPuesto.value = { nombre: puesto.nombre ?? '', activo: puesto.activo !== false }
  errorPuesto.value = null
  dialogoPuesto.value = true
}

async function guardarPuesto() {
  errorPuesto.value = null
  const central = puestoEditando.value?.central

  const cambios = central
    ? { nombre: formPuesto.value.nombre }
    : { nombre: formPuesto.value.nombre, activo: formPuesto.value.activo }

  const parsed = actualizarPuestoAdminSchema.safeParse(cambios)
  if (!parsed.success) {
    errorPuesto.value = primerErrorZod(parsed)
    return
  }

  guardando.value = true
  try {
    await api.actualizarPuesto(puestoEditando.value.id, parsed.data)
    toast.add({ title: 'Puesto actualizado', color: 'success', icon: 'i-lucide-check' })
    dialogoPuesto.value = false
    await cargar()
  } catch (err) {
    errorPuesto.value = err.message
  } finally {
    guardando.value = false
  }
}

// --- Edición del jefe ---
const dialogoJefe = ref(false)
const jefeEditando = ref(null)
const errorJefe = ref(null)
const formJefe = ref(vacioJefe())

const camposJefe = [
  { name: 'nombre', label: 'Nombre de usuario', type: 'text', required: true, props: { maxlength: 100, autocapitalize: 'none' } },
  { name: 'telefono', label: 'Teléfono', type: 'text', placeholder: 'Opcional', props: { maxlength: 30 } },
  { name: 'notas', label: 'Notas', type: 'textarea', placeholder: 'Opcional', props: { rows: 2, maxlength: 500 } },
  { name: 'activo', label: 'Usuario activo', type: 'switch' },
  { name: 'salario', label: 'Salario base', type: 'number', props: { min: 0 } }
]

function vacioJefe() {
  return { nombre: '', telefono: '', notas: '', activo: true, salario: 0 }
}

function abrirJefe(jefe) {
  jefeEditando.value = jefe
  formJefe.value = {
    nombre: jefe.nombre ?? '',
    telefono: jefe.telefono ?? '',
    notas: jefe.notas ?? '',
    activo: jefe.activo !== false,
    salario: Number(jefe.salario ?? 0)
  }
  errorJefe.value = null
  dialogoJefe.value = true
}

async function guardarJefe() {
  errorJefe.value = null
  const parsed = actualizarJefeAdminSchema.safeParse({
    nombre: formJefe.value.nombre,
    telefono: formJefe.value.telefono || null,
    notas: formJefe.value.notas || null,
    activo: formJefe.value.activo,
    salario: Number(formJefe.value.salario) || 0
  })

  if (!parsed.success) {
    errorJefe.value = primerErrorZod(parsed)
    return
  }

  guardando.value = true
  try {
    await api.actualizarJefe(jefeEditando.value.id, parsed.data)
    toast.add({ title: 'Jefe actualizado', color: 'success', icon: 'i-lucide-check' })
    dialogoJefe.value = false
    await cargar()
  } catch (err) {
    errorJefe.value = err.message
  } finally {
    guardando.value = false
  }
}

// --- Permisos ---
const dialogoPermisos = ref(false)
const puestoPermisos = ref(null)
const guardandoPermisos = ref(false)

function abrirPermisos(puesto) {
  puestoPermisos.value = puesto
  dialogoPermisos.value = true
}

async function guardarPermisos(permisos) {
  if (!puestoPermisos.value) return
  guardandoPermisos.value = true
  try {
    await api.actualizarPuesto(puestoPermisos.value.id, { permisos })
    toast.add({ title: 'Permisos guardados', color: 'success', icon: 'i-lucide-check' })
    dialogoPermisos.value = false
    await cargar()
  } catch (err) {
    toast.add({ title: 'No se guardaron los permisos', description: err?.message, color: 'error' })
  } finally {
    guardandoPermisos.value = false
  }
}

// --- Reset de PIN ---
const dialogoPin = ref(false)
const jefePin = ref(null)
const errorPin = ref(null)
const formPin = ref({ pin: '', confirmar: '' })

const camposPin = [
  { name: 'pin', label: 'Nuevo PIN', type: 'password', required: true, placeholder: '4 a 6 dígitos', props: { inputmode: 'numeric', maxlength: 6 } },
  { name: 'confirmar', label: 'Repite el PIN', type: 'password', required: true, placeholder: '4 a 6 dígitos', props: { inputmode: 'numeric', maxlength: 6 } }
]

function abrirPin(jefe) {
  jefePin.value = jefe
  formPin.value = { pin: '', confirmar: '' }
  errorPin.value = null
  dialogoPin.value = true
}

async function guardarPin() {
  errorPin.value = null

  const parsed = resetPinAdminSchema.safeParse({ pin: formPin.value.pin })
  if (!parsed.success) {
    errorPin.value = primerErrorZod(parsed)
    return
  }
  if (formPin.value.pin !== formPin.value.confirmar) {
    errorPin.value = 'Los dos PIN no coinciden.'
    return
  }

  guardando.value = true
  try {
    await api.resetPin(jefePin.value.id, parsed.data.pin)
    toast.add({
      title: 'PIN actualizado',
      description: 'El jefe tendrá que iniciar sesión de nuevo en sus dispositivos.',
      color: 'success',
      icon: 'i-lucide-key-round'
    })
    dialogoPin.value = false
  } catch (err) {
    errorPin.value = err.message
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <BaseHeaderPage
    title="Puestos"
    description="Locales del negocio y su usuario jefe"
    leading-icon="i-lucide-store"
    title-button="Nuevo puesto"
    @new="abrirAlta"
  >
    <template #trailing>
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
      :data="filtrados"
      :columns="columnas"
      :loading-prop="cargando"
      :show-edit="false"
      :show-delete="false"
      empty-state="No hay puestos que coincidan"
      @reload="cargar"
    >
      <template #toolbar-leading>
        <UInput
          v-model="busqueda"
          icon="i-lucide-search"
          placeholder="Buscar puesto o jefe"
          size="sm"
          class="w-44 sm:w-64"
        />
        <USelect
          v-model="filtroEstado"
          :items="estados"
          size="sm"
          class="w-32"
        />
      </template>

      <template #nombre-cell="{ row }">
        <div class="flex items-center gap-2">
          <span class="font-medium">{{ row.original.nombre }}</span>
          <UBadge
            v-if="row.original.central"
            color="primary"
            variant="soft"
            size="sm"
            label="Central"
          />
        </div>
        <p class="text-xs text-muted">
          Creado {{ fmtFechaHora(row.original.creadoEn) }}
        </p>
      </template>

      <template #jefe-cell="{ row }">
        <div v-if="!row.original.jefes?.length" class="text-sm text-muted">
          Sin jefe
        </div>
        <div v-else class="space-y-1">
          <div
            v-for="jefe in row.original.jefes"
            :key="jefe.id"
            class="flex items-center gap-1.5"
          >
            <span class="truncate text-sm">{{ jefe.nombre }}</span>
            <UBadge
              v-if="!jefe.activo"
              color="warning"
              variant="soft"
              size="sm"
              label="Inactivo"
            />
            <UTooltip text="Editar jefe" :delay-duration="0">
              <UButton
                icon="i-lucide-user-cog"
                size="xs"
                color="neutral"
                variant="ghost"
                aria-label="Editar jefe"
                @click="abrirJefe(jefe)"
              />
            </UTooltip>
            <UTooltip text="Resetear PIN" :delay-duration="0">
              <UButton
                icon="i-lucide-key-round"
                size="xs"
                color="neutral"
                variant="ghost"
                aria-label="Resetear PIN"
                @click="abrirPin(jefe)"
              />
            </UTooltip>
          </div>
        </div>
      </template>

      <template #dispositivos-cell="{ row }">
        <span>{{ row.original.dispositivos }}</span>
        <span v-if="row.original.dispositivosRevocados" class="ml-1 text-xs text-muted">
          ({{ row.original.dispositivosRevocados }} revocados)
        </span>
      </template>

      <template #fallosAbiertos-cell="{ row }">
        <UBadge
          :color="row.original.fallosAbiertos > 0 ? 'error' : 'neutral'"
          :variant="row.original.fallosAbiertos > 0 ? 'soft' : 'outline'"
          size="sm"
          :label="String(row.original.fallosAbiertos)"
        />
      </template>

      <template #ultimaSyncOkEn-cell="{ row }">
        <span class="text-sm">
          {{ fmtFechaHora(row.original.ultimaSyncOkEn) }}
        </span>
      </template>

      <template #acceso-cell="{ row }">
        <UBadge
          v-if="row.original.central"
          color="neutral"
          variant="outline"
          size="sm"
          label="Central"
        />
        <UBadge
          v-else
          :color="(row.original.permisos && Object.keys(row.original.permisos).length) ? 'warning' : 'neutral'"
          variant="soft"
          size="sm"
          :label="resumenAcceso(row.original.permisos)"
        />
      </template>

      <template #acciones-cell="{ row }">
        <div class="flex justify-end gap-1">
          <UTooltip text="Editar puesto" :delay-duration="0">
            <UButton
              icon="i-lucide-pencil"
              size="xs"
              color="neutral"
              variant="ghost"
              aria-label="Editar puesto"
              @click="abrirPuesto(row.original)"
            />
          </UTooltip>
          <UTooltip
            :text="row.original.central
              ? 'El puesto central se administra desde el super admin'
              : 'Permisos del puesto'"
            :delay-duration="0"
          >
            <!-- Span intermedio: un UButton deshabilitado no dispara el tooltip. -->
            <span class="inline-flex">
              <UButton
                icon="i-lucide-shield-check"
                size="xs"
                color="neutral"
                variant="ghost"
                :aria-label="row.original.central
                  ? 'El puesto central no tiene permisos configurables'
                  : 'Permisos del puesto'"
                :disabled="row.original.central"
                @click="abrirPermisos(row.original)"
              />
            </span>
          </UTooltip>
          <UTooltip text="Ver dispositivos" :delay-duration="0">
            <UButton
              :to="`/admin/dispositivos?puestoId=${row.original.id}`"
              icon="i-lucide-smartphone"
              size="xs"
              color="neutral"
              variant="ghost"
              aria-label="Ver dispositivos"
            />
          </UTooltip>
        </div>
      </template>
    </BaseTable>

    <BaseDialog
      v-model="dialogoAlta"
      title="Nuevo puesto"
      description="Crea el local y su usuario jefe en un solo paso."
      confirm-text="Crear puesto"
      :loading="guardando"
      @confirm="guardarAlta"
      @cancel="dialogoAlta = false"
    >
      <div class="space-y-4">
        <UAlert
          v-if="errorAlta"
          color="error"
          variant="soft"
          icon="i-lucide-alert-circle"
          :title="errorAlta"
        />
        <BaseForm v-model="formAlta" :fields="camposAlta" />
      </div>
    </BaseDialog>

    <BaseDialog
      v-model="dialogoPuesto"
      title="Editar puesto"
      :confirm-text="'Guardar cambios'"
      :loading="guardando"
      @confirm="guardarPuesto"
      @cancel="dialogoPuesto = false"
    >
      <div class="space-y-4">
        <UAlert
          v-if="errorPuesto"
          color="error"
          variant="soft"
          icon="i-lucide-alert-circle"
          :title="errorPuesto"
        />
        <UAlert
          v-if="puestoEditando?.central"
          color="neutral"
          variant="soft"
          icon="i-lucide-shield-check"
          title="Puesto central"
          description="Aloja la cuenta de administración: no se puede desactivar desde el panel."
        />
        <BaseForm v-model="formPuesto" :fields="camposPuesto" />
      </div>
    </BaseDialog>

    <BaseDialog
      v-model="dialogoJefe"
      title="Editar jefe"
      description="Datos y acceso del usuario que administra el local."
      confirm-text="Guardar cambios"
      :loading="guardando"
      @confirm="guardarJefe"
      @cancel="dialogoJefe = false"
    >
      <div class="space-y-4">
        <UAlert
          v-if="errorJefe"
          color="error"
          variant="soft"
          icon="i-lucide-alert-circle"
          :title="errorJefe"
        />
        <BaseForm v-model="formJefe" :fields="camposJefe" />
      </div>
    </BaseDialog>

    <AdminPermisosPuesto
      v-model="dialogoPermisos"
      :puesto="puestoPermisos"
      :otros-puestos="filas.filter(p => p.id !== puestoPermisos?.id)"
      :loading="guardandoPermisos"
      @save="guardarPermisos"
    />

    <BaseDialog
      v-model="dialogoPin"
      title="Resetear PIN"
      :description="jefePin ? `Se asignará un PIN nuevo a ${jefePin.nombre}.` : undefined"
      confirm-text="Cambiar PIN"
      :loading="guardando"
      @confirm="guardarPin"
      @cancel="dialogoPin = false"
    >
      <div class="space-y-4">
        <UAlert
          v-if="errorPin"
          color="error"
          variant="soft"
          icon="i-lucide-alert-circle"
          :title="errorPin"
        />
        <UAlert
          color="warning"
          variant="soft"
          icon="i-lucide-key-round"
          title="Se cerrarán sus sesiones"
          description="Los tokens emitidos antes dejan de valer; el jefe deberá iniciar sesión otra vez."
        />
        <BaseForm v-model="formPin" :fields="camposPin" />
      </div>
    </BaseDialog>
  </BaseHeaderPage>
</template>
