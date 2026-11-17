<script setup>
import {
  IDIOMAS_FLOTA,
  MOTORES_FLOTA,
  VOZ_RETENCION_MAX,
  VOZ_RETENCION_MIN,
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
    retencionDias: Number(form.value.retencionDias)
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

onMounted(cargar)
</script>

<template>
  <BaseHeaderPage
    title="Configuración de voz"
    description="Palabra clave, motor, idioma y retención que aplican todos los equipos"
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
      description="Cada equipo descarga esta configuración al sincronizar y guarda una copia para trabajar sin red. Un cambio manual en Ajustes → Avanzado se respeta hasta el próximo cambio de flota."
    />

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
