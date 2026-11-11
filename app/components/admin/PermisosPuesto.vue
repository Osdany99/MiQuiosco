/* eslint-disable @stylistic/max-statements-per-line */
<template>
  <BaseDialog
    v-model="open"
    title="Permisos del puesto"
    :description="puesto ? `«${puesto.nombre}» — lo que el super admin deja ver o hacer en el equipo.` : undefined"
    confirm-text="Guardar permisos"
    :loading="loading"
    :ui="{ content: 'sm:max-w-xl' }"
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
      <div class="flex flex-wrap items-center gap-2">
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
          icon="i-lucide-eye"
          label="Solo consulta"
          @click="aplicarPreset('consulta')"
        />
        <UButton
          class="ml-auto"
          size="xs"
          variant="ghost"
          color="neutral"
          icon="i-lucide-rotate-ccw"
          label="Restablecer defaults"
          @click="aplicarPreset('defaults')"
        />
      </div>

      <!-- Búsqueda y expansión -->
      <div class="flex items-center gap-2">
        <UInput
          v-model="busqueda"
          icon="i-lucide-search"
          placeholder="Buscar vista o acción"
          size="sm"
          class="min-w-0 flex-1"
        />
        <template v-if="!hayBusqueda">
          <UButton
            size="xs"
            variant="ghost"
            color="neutral"
            icon="i-lucide-chevrons-down"
            label="Expandir"
            aria-label="Expandir todas las vistas"
            @click="expandirTodas"
          />
          <UButton
            size="xs"
            variant="ghost"
            color="neutral"
            icon="i-lucide-chevrons-up"
            label="Contraer"
            aria-label="Contraer todas las vistas"
            @click="contraerTodas"
          />
        </template>
      </div>

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

      <div class="max-h-[52vh] overflow-auto rounded-lg border border-default">
        <div class="divide-y divide-default">
          <section v-for="(grupo, nombre) in gruposFiltrados" :key="nombre" class="px-3 py-2.5">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-muted">
              {{ nombre }}
            </h3>
            <div class="mt-1 divide-y divide-default">
              <div v-for="vista in grupo" :key="vista.key" class="py-0.5">
                <div class="flex min-h-11 items-center gap-3">
                  <UIcon :name="vista.icon" class="size-4 shrink-0 text-muted" />
                  <button
                    v-if="tieneAcciones(vista)"
                    type="button"
                    class="flex min-w-0 flex-1 items-center gap-2 text-left"
                    :aria-expanded="estaExpandida(vista.key)"
                    :aria-controls="`perm-${vista.key}`"
                    @click="alternarVista(vista.key)"
                  >
                    <span class="truncate text-sm font-medium">{{ vista.label }}</span>
                    <UBadge
                      size="sm"
                      variant="soft"
                      :color="resumenVista(vista).todas ? 'success' : 'neutral'"
                      class="shrink-0"
                    >
                      {{ resumenVista(vista).activas }}/{{ resumenVista(vista).total }}
                    </UBadge>
                    <UIcon
                      name="i-lucide-chevron-down"
                      class="ml-auto size-4 shrink-0 text-muted transition-transform"
                      :class="estaExpandida(vista.key) ? 'rotate-180' : ''"
                    />
                  </button>
                  <span v-else class="min-w-0 flex-1 truncate text-sm font-medium">
                    {{ vista.label }}
                  </span>
                  <USwitch
                    v-model="estado[claveVista(vista.key)]"
                    :disabled="vista.obligatorio"
                    :aria-label="vista.obligatorio ? `${vista.label} (obligatoria)` : vista.label"
                    class="shrink-0"
                  />
                </div>

                <template v-if="tieneAcciones(vista)">
                  <div
                    v-show="estaExpandida(vista.key)"
                    :id="`perm-${vista.key}`"
                    class="ml-6 space-y-1 border-l border-default pb-1.5 pl-3"
                  >
                    <div
                      v-for="acc in accionesVisibles(vista)"
                      :key="acc.key"
                      class="flex min-h-9 items-center justify-between gap-3"
                    >
                      <span class="truncate text-xs text-muted">{{ acc.label }}</span>
                      <USwitch
                        v-model="estado[claveAccion(vista.key, acc.key)]"
                        :disabled="!estado[claveVista(vista.key)]"
                        :aria-label="acc.label"
                        class="shrink-0"
                      />
                    </div>
                  </div>
                </template>
              </div>
            </div>
          </section>

          <!-- Datos sensibles -->
          <section v-if="datosFiltrados.length" class="px-3 py-2.5">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-muted">
              Datos sensibles
            </h3>
            <div class="mt-1 divide-y divide-default">
              <div
                v-for="d in datosFiltrados"
                :key="d.key"
                class="flex min-h-11 items-center justify-between gap-3"
              >
                <span class="text-sm">{{ d.label }}</span>
                <USwitch
                  v-model="estado[claveDato(d.key)]"
                  :aria-label="d.label"
                  class="shrink-0"
                />
              </div>
            </div>
          </section>

          <!-- Modalidades de venta -->
          <section v-if="ventaFiltrada.length" class="px-3 py-2.5">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-muted">
              Modalidades de venta
            </h3>
            <div class="mt-1 divide-y divide-default">
              <div
                v-for="v in ventaFiltrada"
                :key="v.key"
                class="flex min-h-11 items-center justify-between gap-3"
              >
                <span class="text-sm">{{ v.label }}</span>
                <USwitch
                  v-model="estado[v.key]"
                  :aria-label="v.label"
                  class="shrink-0"
                />
              </div>
            </div>
          </section>
        </div>

        <p v-if="!hayResultados" class="px-3 py-6 text-center text-sm text-muted">
          Sin resultados.
        </p>
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
  otrosPuestos: { type: Array, default: () => [] },
  // El guardado lo hace la página: mientras corre, el diálogo no se cierra y
  // el botón de confirmar muestra la carga real (antes cerraba a ciegas).
  loading: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue', 'save'])

const permisos = computed(() => props.puesto?.permisos || {})
const estado = ref({})
const busqueda = ref('')
const copiarDe = ref(null)
const error = ref(null)
// Vistas cuyas acciones están desplegadas. Por defecto todo contraído.
const expandidas = ref(new Set())

const open = computed({
  get: () => props.modelValue,
  set: v => emit('update:modelValue', v)
})

const hayBusqueda = computed(() => busqueda.value.trim().length > 0)

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
    busqueda.value = ''
    copiarDe.value = null
    expandidas.value = new Set()
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

const hayResultados = computed(() => Object.keys(gruposFiltrados.value).length > 0
  || datosFiltrados.value.length > 0
  || ventaFiltrada.value.length > 0)

function tieneAcciones(vista) {
  return (vista.acciones || []).length > 0
}

function accionesVisibles(vista) {
  const acciones = vista.acciones || []
  const texto = busqueda.value.trim().toLowerCase()
  if (!texto) return acciones
  if (vista.label.toLowerCase().includes(texto)) return acciones
  return acciones.filter(a => a.label.toLowerCase().includes(texto))
}

function resumenVista(vista) {
  const acciones = vista.acciones || []
  const vistaOn = !!estado.value[claveVista(vista.key)]
  const activas = vistaOn
    ? acciones.filter(a => estado.value[claveAccion(vista.key, a.key)]).length
    : 0
  return { activas, total: acciones.length, todas: acciones.length > 0 && activas === acciones.length }
}

function alternarVista(key) {
  const siguiente = new Set(expandidas.value)
  if (siguiente.has(key)) siguiente.delete(key)
  else siguiente.add(key)
  expandidas.value = siguiente
}

function estaExpandida(key) {
  // Mientras se busca, todo lo que coincide se muestra abierto.
  return hayBusqueda.value || expandidas.value.has(key)
}

function expandirTodas() {
  expandidas.value = new Set(
    VISTAS.filter(v => !v.virtual && (v.acciones || []).length).map(v => v.key)
  )
}

function contraerTodas() {
  expandidas.value = new Set()
}

function aplicarPreset(nombre) {
  const nuevo = {}
  for (const k of Object.keys(estado.value)) nuevo[k] = defectoDeClave(k)

  if (nombre === 'completo') {
    for (const k of Object.keys(nuevo)) nuevo[k] = true
  } else if (nombre === 'consulta') {
    for (const k of Object.keys(nuevo)) {
      if (k.startsWith('vistas.') || k.startsWith('datos.') || k.startsWith('venta.')) nuevo[k] = true
      else nuevo[k] = false
    }
  }
  // 'defaults' ya se resolvió con defectoDeClave() arriba.

  estado.value = nuevo
  expandidas.value = new Set()
}

function onCopiar(valor) {
  if (!valor) return
  // Con `value-key="id"` el select emite el id, no el objeto.
  const otro = typeof valor === 'string'
    ? props.otrosPuestos.find(p => p.id === valor)
    : valor
  if (!otro) return
  const completo = estadoCompleto(otro.permisos || {})
  estado.value = { ...completo }
  expandidas.value = new Set()
}

function confirmar() {
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
  // El cierre lo decide la página cuando el PATCH termina bien: si falla, el
  // diálogo sigue abierto con lo elegido y se muestra el error.
  emit('save', overrides)
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
