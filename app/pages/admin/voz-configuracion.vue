<script setup>
import {
  IDIOMAS_FLOTA,
  MOTORES_FLOTA,
  VOZ_RETENCION_ACIERTOS_MAX,
  VOZ_RETENCION_ACIERTOS_MIN,
  VOZ_RETENCION_MAX,
  VOZ_RETENCION_MIN,
  etiquetaIdioma,
  etiquetaMotor,
  normalizarVozConfig
} from '#shared/voz/config'
import { vozConfigSchema } from '#shared/schemas/vozConfig'

definePageMeta({
  layout: 'admin',
  middleware: ['super-admin']
})

const api = useAdminApi()
const toast = useToast()
const cargando = ref(false)
const guardando = ref(false)
const limpiando = ref(false)
const confirmarDepurar = ref(false)
const errorCarga = ref(null)
const errorForm = ref('')
const form = ref(normalizarVozConfig({}))

const itemsMotor = computed(() =>
  MOTORES_FLOTA.map(o => ({ label: o.label, value: o.id }))
)
const itemsIdioma = computed(() =>
  IDIOMAS_FLOTA.map(o => ({ label: o.label, value: o.id }))
)
const motorDetalle = computed(() =>
  MOTORES_FLOTA.find(o => o.id === form.value.motor)?.detalle ?? ''
)
const idiomaDetalle = computed(() =>
  IDIOMAS_FLOTA.find(o => o.id === form.value.idioma)?.detalle ?? ''
)
const actualizado = computed(() =>
  form.value.actualizadoEn ? fmtFechaHora(form.value.actualizadoEn) : '—'
)

async function cargar() {
  cargando.value = true
  errorCarga.value = null
  try {
    const respuesta = await api.obtenerConfigVoz()
    form.value = normalizarVozConfig(respuesta?.config)
  } catch (e) {
    errorCarga.value = e?.message || 'No se pudo cargar la configuración de voz.'
  } finally {
    cargando.value = false
  }
}

async function guardar() {
  if (guardando.value) return
  errorForm.value = ''
  const parsed = vozConfigSchema.safeParse({
    wake: form.value.wake,
    motor: form.value.motor,
    idioma: form.value.idioma,
    retencionDias: Number(form.value.retencionDias),
    capturarTexto: form.value.capturarTexto === true,
    capturarAciertos: form.value.capturarAciertos === true,
    retencionAciertosDias: Number(form.value.retencionAciertosDias)
  })
  if (!parsed.success) {
    errorForm.value = parsed.error.issues?.[0]?.message || 'Revisa los valores.'
    return
  }

  guardando.value = true
  try {
    const respuesta = await api.guardarConfigVoz(parsed.data)
    form.value = normalizarVozConfig(respuesta?.config)
    toast.add({
      title: 'Configuración de voz',
      description: `Guardada la versión ${form.value.version}. Los equipos la aplican al sincronizar.`,
      color: 'success'
    })
  } catch (e) {
    errorForm.value = e?.message || 'No se pudo guardar la configuración.'
  } finally {
    guardando.value = false
  }
}

async function depurar() {
  confirmarDepurar.value = false
  limpiando.value = true
  try {
    const r = await api.limpiarEventosVoz()
    toast.add({
      title: 'Eventos de voz',
      description: `Depurados ${r?.eliminados ?? 0} eventos con más de ${r?.dias ?? form.value.retencionDias} días.`,
      color: 'success'
    })
  } catch (e) {
    toast.add({
      title: 'Eventos de voz',
      description: e?.message || 'No se pudo depurar.',
      color: 'error'
    })
  } finally {
    limpiando.value = false
  }
}

// --- Equipos con configuración propia ---
// Con qué motor escucha cada equipo se decide por aparato (ver
// /admin/dispositivos). Aquí solo se listan los que no usan la flota.
const overrides = ref([])
const cargandoOverrides = ref(false)
const errorOverrides = ref(null)

const columnasOverrides = [
  { accessorKey: 'dispositivoNombre', header: 'Equipo' },
  { accessorKey: 'puestoNombre', header: 'Puesto' },
  { accessorKey: 'motor', header: 'Motor' },
  { accessorKey: 'idioma', header: 'Idioma' },
  { accessorKey: 'wake', header: 'Palabra clave' },
  { accessorKey: 'actualizadoEn', header: 'Actualizado' }
]

async function cargarOverrides() {
  cargandoOverrides.value = true
  errorOverrides.value = null
  try {
    overrides.value = await api.listarDispositivosConVozPropia()
  } catch (e) {
    errorOverrides.value = e?.message || 'No se pudieron cargar los equipos con voz propia.'
  } finally {
    cargandoOverrides.value = false
  }
}

onMounted(() => {
  cargar()
  cargarOverrides()
})
</script>

<template>
  <BaseHeaderPage
    title="Configuración de voz"
    description="Valores por defecto de la flota: palabra clave, motor, idioma y retención. Cada equipo puede pisar motor, idioma y palabra clave."
    leading-icon="i-lucide-settings-2"
    :show-button="false"
  >
    <template #trailing>
      <span class="text-sm text-muted">
        Versión {{ form.version || '—' }} · {{ actualizado }}
      </span>
      <UButton
        icon="i-lucide-refresh-cw"
        variant="outline"
        label="Recargar"
        :loading="cargando"
        @click="cargar"
      />
      <UButton
        icon="i-lucide-save"
        color="primary"
        label="Guardar"
        :loading="guardando"
        @click="guardar"
      />
    </template>

    <UAlert
      v-if="errorCarga"
      color="error"
      variant="soft"
      icon="i-lucide-alert-circle"
      :title="errorCarga"
    />

    <div class="grid gap-4 lg:grid-cols-3">
      <UCard class="lg:col-span-2">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-mic" class="size-5 text-primary" />
            <h2 class="font-semibold">
              Escucha
            </h2>
          </div>
        </template>

        <div class="space-y-4">
          <UFormField
            label="Palabra clave"
            required
            help="Al menos dos palabras. «nova» a secas dispara con la conversación del mostrador."
          >
            <UInput
              v-model="form.wake"
              placeholder="oye nova"
              maxlength="40"
              icon="i-lucide-audio-lines"
              class="w-full"
            />
          </UFormField>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Motor de reconocimiento" required>
              <USelect
                v-model="form.motor"
                :items="itemsMotor"
                class="w-full"
              />
              <p class="mt-1 text-xs text-muted">
                {{ motorDetalle }}
              </p>
            </UFormField>

            <UFormField label="Idioma" required>
              <USelect
                v-model="form.idioma"
                :items="itemsIdioma"
                class="w-full"
              />
              <p class="mt-1 text-xs text-muted">
                {{ idiomaDetalle }}
              </p>
            </UFormField>
          </div>

          <UAlert
            v-if="errorForm"
            color="error"
            variant="soft"
            icon="i-lucide-alert-circle"
            :title="errorForm"
          />
        </div>
      </UCard>

      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-database" class="size-5 text-primary" />
            <h2 class="font-semibold">
              Telemetría
            </h2>
          </div>
        </template>

        <div class="space-y-4">
          <UFormField
            label="Retención de eventos"
            required
            :help="`Entre ${VOZ_RETENCION_MIN} y ${VOZ_RETENCION_MAX} días.`"
          >
            <UInputNumber
              v-model="form.retencionDias"
              :min="VOZ_RETENCION_MIN"
              :max="VOZ_RETENCION_MAX"
              class="w-full"
            />
          </UFormField>

          <p class="text-xs text-muted">
            La tarea nocturna borra los eventos antiguos con menos de 3 intentos.
            Los que se repiten se conservan para mejorar el léxico.
          </p>

          <div class="space-y-2 rounded-lg border border-warning/40 bg-warning/5 p-3">
            <USwitch v-model="form.capturarTexto" color="warning">
              Guardar el texto dictado (sin enmascarar)
            </USwitch>
            <p class="text-xs text-muted">
              Para diagnosticar por qué falla una frase: el panel de eventos muestra
              lo que se dijo y qué se extrajo. Puede incluir nombres de clientes,
              así que se apaga a mano cuando termines.
            </p>
          </div>

          <div class="space-y-2 rounded-lg border border-warning/40 bg-warning/5 p-3">
            <USwitch v-model="form.capturarAciertos" color="warning">
              Guardar comandos exitosos (con su texto)
            </USwitch>
            <p class="text-xs text-muted">
              Guarda una fila por cada dictado que la app entendió y aplicó, con la
              frase cruda y la acción resultante. Sirve para detectar comandos que
              «funcionaron» pero entendieron otra cosa. Puede contener nombres de
              clientes: apágalo y bórralos desde la pestaña Aciertos del panel.
            </p>
            <UFormField
              label="Retención de aciertos"
              :help="`Entre ${VOZ_RETENCION_ACIERTOS_MIN} y ${VOZ_RETENCION_ACIERTOS_MAX} días. Van una fila por dictado.`"
            >
              <UInputNumber
                v-model="form.retencionAciertosDias"
                :min="VOZ_RETENCION_ACIERTOS_MIN"
                :max="VOZ_RETENCION_ACIERTOS_MAX"
                class="w-full"
              />
            </UFormField>
          </div>

          <UButton
            icon="i-lucide-trash-2"
            color="warning"
            variant="outline"
            block
            :loading="limpiando"
            @click="confirmarDepurar = true"
          >
            Depurar ahora
          </UButton>
        </div>
      </UCard>
    </div>

    <UAlert
      color="info"
      variant="soft"
      icon="i-lucide-info"
      title="Cómo llega a los equipos"
      description="Cada equipo descarga su configuración al sincronizar y guarda una copia para trabajar sin red. Un cambio manual en Ajustes → Avanzado se respeta hasta el próximo cambio de flota o del equipo."
    />

    <UCard>
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-smartphone" class="size-5 text-primary" />
            <h2 class="font-semibold">
              Equipos con configuración propia
            </h2>
          </div>
          <UButton
            icon="i-lucide-refresh-cw"
            variant="ghost"
            size="xs"
            label="Recargar"
            :loading="cargandoOverrides"
            @click="cargarOverrides"
          />
        </div>
      </template>

      <UAlert
        v-if="errorOverrides"
        color="error"
        variant="soft"
        icon="i-lucide-alert-circle"
        :title="errorOverrides"
      />

      <UTable
        v-else
        :data="overrides"
        :columns="columnasOverrides"
        :loading="cargandoOverrides"
        empty="Todos los equipos usan estos valores"
      >
        <template #dispositivoNombre-cell="{ row }">
          <NuxtLink
            :to="{ path: '/admin/dispositivos', query: { puestoId: row.original.puestoId } }"
            class="font-medium text-primary hover:underline"
          >
            {{ row.original.dispositivoNombre || 'Equipo sin nombre' }}
          </NuxtLink>
          <p class="text-xs text-muted">
            {{ row.original.modelo || 'Modelo desconocido' }}
          </p>
        </template>
        <template #puestoNombre-cell="{ row }">
          {{ row.original.puestoNombre || '—' }}
        </template>
        <template #motor-cell="{ row }">
          {{ row.original.motor ? etiquetaMotor(row.original.motor) : 'Flota' }}
        </template>
        <template #idioma-cell="{ row }">
          {{ row.original.idioma ? etiquetaIdioma(row.original.idioma) : 'Flota' }}
        </template>
        <template #wake-cell="{ row }">
          {{ row.original.wake ? `«${row.original.wake}»` : 'Flota' }}
        </template>
        <template #actualizadoEn-cell="{ row }">
          <span class="text-sm">{{ fmtFechaHora(row.original.actualizadoEn) }}</span>
        </template>
      </UTable>

      <p class="mt-3 text-xs text-muted">
        Se editan en Dispositivos → detalle → «Voz de este equipo», o de una vez
        para todo un puesto desde ahí mismo.
      </p>
    </UCard>

    <BaseDialog
      v-model="confirmarDepurar"
      title="Depurar eventos de voz"
      :description="`Se eliminan los eventos con más de ${Number(form.retencionDias) || 30} días y menos de 3 intentos.`"
      confirm-text="Depurar"
      confirm-color="warning"
      :loading="limpiando"
      @confirm="depurar"
    >
      <p class="text-sm text-muted">
        La operación no se puede deshacer. Los eventos con 3 o más intentos se
        conservan para mejorar el léxico.
      </p>
    </BaseDialog>
  </BaseHeaderPage>
</template>
