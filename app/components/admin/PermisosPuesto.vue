/* eslint-disable @stylistic/max-statements-per-line */
<template>
  <BaseDialog
    v-model="open"
    title="Permisos del puesto"
    :description="puesto ? `«${puesto.nombre}» — lo que el super admin deja ver o hacer en el equipo.` : undefined"
    confirm-text="Guardar permisos"
    :loading="guardando"
    @confirm="confirmar"
    @cancel="cerrar"
  >
    <div class="space-y-4">
      <UAlert
        v-if="error"
        color="error"
        variant="soft"
        icon="i-lucide-alert-circle"
        :title="error"
      />

      <!-- Presets rápidos -->
      <div class="flex flex-wrap gap-2">
        <UButton
          size="xs"
          variant="soft"
          color="primary"
          icon="i-lucide-check"
          label="Completo"
          @click="aplicarPreset('completo')"
        />
        <UButton
          size="xs"
          variant="soft"
          color="neutral"
          icon="i-lucide-lock"
          label="Solo cuadre"
          @click="aplicarPreset('solo-cuadre')"
        />
        <UButton
          size="xs"
          variant="soft"
          color="neutral"
          icon="i-lucide-store"
          label="Quiosco + cuadre"
          @click="aplicarPreset('quiosco')"
        />
        <UButton
          size="xs"
          variant="soft"
          color="neutral"
          icon="i-lucide-smartphone"
          label="Recargas"
          @click="aplicarPreset('recargas')"
        />
        <UButton
          size="xs"
          variant="soft"
          color="neutral"
          icon="i-lucide-eye"
          label="Solo consulta"
          @click="aplicarPreset('consulta')"
        />
        <UButton
          size="xs"
          variant="soft"
          color="neutral"
          icon="i-lucide-rotate-ccw"
          label="Restablecer defaults"
          @click="aplicarPreset('defaults')"
        />
      </div>

      <!-- Vista previa -->
      <UAlert
        color="neutral"
        variant="soft"
        icon="i-lucide-info"
        title="Aplicación"
        description="Se aplican en la próxima sincronización del equipo."
      />

      <UInput
        v-model="busqueda"
        icon="i-lucide-search"
        placeholder="Buscar vista o acción"
        size="sm"
        class="w-full"
      />

      <!-- Copiar de otro puesto -->
      <div v-if="otrosPuestos.length" class="flex items-center gap-2">
        <span class="text-sm text-muted">Copiar de:</span>
        <USelectMenu
          v-model="copiarDe"
          :items="otrosPuestos"
          value-key="id"
          label-key="nombre"
          size="sm"
          class="w-52"
          @update:model-value="onCopiar"
        />
      </div>

      <div class="max-h-[50vh] overflow-auto space-y-3 pr-1">
        <template v-for="(grupo, nombre) in gruposFiltrados" :key="nombre">
          <UCard variant="soft">
            <template #header>
              <span class="font-semibold text-sm">{{ nombre }}</span>
            </template>
            <div class="space-y-2">
              <template v-for="vista in grupo" :key="vista.key">
                <div class="flex items-center justify-between gap-3">
                  <div class="flex items-center gap-2 min-w-0">
                    <UIcon :name="vista.icon" class="size-4 shrink-0 text-muted" />
                    <div class="min-w-0">
                      <p class="text-sm font-medium truncate">
                        {{ vista.label }}
                      </p>
                      <p class="text-xs text-muted">
                        {{ claveVista(vista.key) }}
                      </p>
                    </div>
                  </div>
                  <USwitch
                    v-model="estado[claveVista(vista.key)]"
                    :disabled="vista.obligatorio"
                    @update:model-value="onCambioVista(vista.key)"
                  />
                </div>

                <div v-if="(vista.acciones || []).length" class="ml-6 pl-2 border-l border-default space-y-1">
                  <template v-for="acc in vista.acciones" :key="acc.key">
                    <div class="flex items-center justify-between gap-3">
                      <p class="text-xs text-muted truncate">
                        {{ acc.label }}
                      </p>
                      <USwitch
                        v-if="busquedaOk(vista, acc)"
                        v-model="estado[claveAccion(vista.key, acc.key)]"
                        :disabled="!estado[claveVista(vista.key)]"
                      />
                    </div>
                  </template>
                </div>
              </template>
            </div>
          </UCard>
        </template>

        <!-- Datos sensibles -->
        <UCard variant="soft">
          <template #header>
            <span class="font-semibold text-sm">Datos sensibles</span>
          </template>
          <div class="space-y-2">
            <template v-for="d in datosFiltrados" :key="d.key">
              <div class="flex items-center justify-between gap-3">
                <p class="text-sm font-medium">
                  {{ d.label }}
                </p>
                <USwitch v-model="estado[claveDato(d.key)]" />
              </div>
            </template>
          </div>
        </UCard>

        <!-- Modalidades de venta -->
        <UCard variant="soft">
          <template #header>
            <span class="font-semibold text-sm">Modalidades de venta</span>
          </template>
          <div class="space-y-2">
            <template v-for="v in ventaFiltrada" :key="v.key">
              <div class="flex items-center justify-between gap-3">
                <p class="text-sm font-medium">
                  {{ v.label }}
                </p>
                <USwitch v-model="estado[v.key]" />
              </div>
            </template>
          </div>
        </UCard>
      </div>

      <!-- Resumen diff -->
      <div class="text-xs text-muted">
        {{ resumenTexto }}
      </div>
    </div>
  </BaseDialog>
</template>

<script setup>
import { VISTAS, DATOS, claveVista, claveAccion, claveDato, vistasPorGrupo, defectoDeClave, estadoCompleto, estadoAOverrides } from '#shared/permisos'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  puesto: { type: Object, default: null },
  otrosPuestos: { type: Array, default: () => [] }
})

const emit = defineEmits(['update:modelValue', 'save'])

const permisos = computed(() => props.puesto?.permisos || {})
const estado = ref({})
const busqueda = ref('')
const copiarDe = ref(null)
const guardando = ref(false)
const error = ref(null)

const open = computed({
  get: () => props.modelValue,
  set: v => emit('update:modelValue', v)
})

function inicializar() {
  const completo = estadoCompleto(permisos.value || {})
  estado.value = { ...completo }
}

watch(
  () => props.puesto,
  () => {
    inicializar()
  },
  { immediate: true }
)
watch(() => props.modelValue, (v) => {
  if (v) {
    inicializar()
    error.value = null
  }
})

const grupos = computed(() => vistasPorGrupo())
const vistasVenta = computed(() => VISTAS.filter(v => v.virtual))

const gruposFiltrados = computed(() => {
  const out = {}
  const texto = busqueda.value.trim().toLowerCase()
  for (const [nombre, lista] of Object.entries(grupos.value)) {
    const filtrada = lista.filter((v) => {
      if (v.virtual) return false
      if (!texto) return true
      if (v.label.toLowerCase().includes(texto)) return true
      return (v.acciones || []).some(a => a.label.toLowerCase().includes(texto))
    })
    if (filtrada.length) out[nombre] = filtrada
  }
  return out
})

const datosFiltrados = computed(() => {
  const texto = busqueda.value.trim().toLowerCase()
  return DATOS.filter(d => !texto || d.label.toLowerCase().includes(texto))
})

const ventaFiltrada = computed(() => {
  const texto = busqueda.value.trim().toLowerCase()
  return vistasVenta.value.filter(v => !texto || v.label.toLowerCase().includes(texto))
})

function busquedaOk(vista, acc) {
  const texto = busqueda.value.trim().toLowerCase()
  if (!texto) return true
  return vista.label.toLowerCase().includes(texto) || acc.label.toLowerCase().includes(texto)
}

function aplicarPreset(nombre) {
  const nuevo = {}
  for (const k of Object.keys(estado.value)) nuevo[k] = defectoDeClave(k)
  const vistasNormales = VISTAS.filter(v => !v.virtual)
  const setVista = (key, on) => {
    nuevo[claveVista(key)] = on
  }
  const setAccion = (vista, acc, on) => {
    nuevo[claveAccion(vista, acc)] = on
  }

  if (nombre === 'defaults') {
    // ya está en defaults
  } else if (nombre === 'completo') {
    for (const k of Object.keys(nuevo)) nuevo[k] = true
  } else if (nombre === 'solo-cuadre') {
    for (const v of vistasNormales) setVista(v.key, v.key === 'cuadre')
    for (const v of VISTAS.filter(x => x.virtual)) nuevo[v.key] = false
    for (const d of DATOS) nuevo[claveDato(d.key)] = false
    for (const v of vistasNormales) for (const a of v.acciones) setAccion(v.key, a.key, (v.key === 'cuadre' && a.key !== 'cerrar' ? false : v.key === 'cuadre'))
  } else if (nombre === 'quiosco') {
    for (const v of vistasNormales) setVista(v.key, ['cuadre', 'quiosco', 'clientes', 'deudas'].includes(v.key))
    for (const v of VISTAS.filter(x => x.virtual)) nuevo[v.key] = ['venta.contado', 'venta.fiado'].includes(v.key)
    for (const d of DATOS) nuevo[claveDato(d.key)] = true
    for (const v of vistasNormales) for (const a of v.acciones) setAccion(v.key, a.key, (['cuadre', 'quiosco', 'clientes', 'deudas'].includes(v.key)) ? a.defecto !== false : false)
  } else if (nombre === 'recargas') {
    for (const v of vistasNormales) setVista(v.key, ['cuadre', 'recargas', 'recargas-sms', 'clientes', 'deudas'].includes(v.key))
    for (const v of VISTAS.filter(x => x.virtual)) nuevo[v.key] = false
    for (const d of DATOS) nuevo[claveDato(d.key)] = true
    for (const v of vistasNormales) for (const a of v.acciones) setAccion(v.key, a.key, (['cuadre', 'recargas', 'recargas-sms', 'clientes', 'deudas'].includes(v.key)) ? a.defecto !== false : false)
  } else if (nombre === 'consulta') {
    for (const k of Object.keys(nuevo)) {
      if (k.startsWith('vistas.') || k.startsWith('datos.') || k.startsWith('venta.')) nuevo[k] = true
      else nuevo[k] = false
    }
  }
  estado.value = nuevo
}

function onCambioVista() {
  // No-op: resolver se hace al guardar.
}

function onCopiar(puesto) {
  if (!puesto) return
  const completo = estadoCompleto(puesto.permisos || {})
  estado.value = { ...completo }
}

async function confirmar() {
  error.value = null
  const overrides = estadoAOverrides(estado.value)
  // Validar que al menos una vista quede activa y cuadre obligatorio.
  const est = estadoCompleto(overrides)
  const vistasOn = Object.keys(est).filter(k => k.startsWith('vistas.') && est[k])
  if (vistasOn.length === 0) {
    error.value = 'Debe quedar al menos una vista visible.'
    return
  }
  if (!est['vistas.cuadre']) {
    error.value = 'El cuadre del día no se puede desactivar.'
    return
  }
  guardando.value = true
  try {
    emit('save', overrides)
    open.value = false
  } catch (e) {
    error.value = e?.message || 'No se pudo guardar.'
  } finally {
    guardando.value = false
  }
}

function cerrar() {
  open.value = false
}

const resumenTexto = computed(() => {
  const est = estadoCompleto(estado.value ? estadoAOverrides(estado.value) : {})
  let vistasOff = 0
  let accionesOff = 0
  for (const k of Object.keys(est)) {
    if (est[k]) continue
    if (k.startsWith('vistas.')) vistasOff++
    else accionesOff++
  }
  return vistasOff === 0 && accionesOff === 0
    ? 'Sin restricciones: el puesto verá todo.'
    : `${vistasOff} vistas y ${accionesOff} acciones desactivadas.`
})
</script>

<script>
// Import alias guard for Vue SFC: usePermisos not needed here.
</script>
