<script setup>
import {
  IDIOMAS_FLOTA,
  MOTORES_FLOTA,
  etiquetaIdioma,
  etiquetaMotor,
  motorParaServicio
} from '#shared/voz/config'

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

/**
 * Todos los filtros viven en el icono: en un teléfono no caben en la barra.
 * `key` es la misma que espera `filtros`, así el popover y la consulta hablan
 * de lo mismo. `server: true` = los aplica la vista (consulta o lista propia),
 * la tabla solo los muestra.
 */
const camposFiltro = computed(() => [
  { key: 'q', label: 'Buscar', server: true },
  { key: 'puestoId', label: 'Puesto', type: 'select', options: opcionesPuesto.value, server: true },
  { key: 'estado', label: 'Estado', type: 'select', options: estados, server: true }
])

const filas = ref([])
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
  { accessorKey: 'voz', header: 'Voz' },
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
    // El popover envía solo las claves con valor: se leen con fallback.
    const puestoId = filtros.value.puestoId ?? 'todos'
    const estado = filtros.value.estado ?? 'todos'
    const q = String(filtros.value.q ?? '').trim()
    const resultado = await api.listarDispositivos({
      puestoId: puestoId === 'todos' ? undefined : puestoId,
      revocado: estado === 'todos' ? undefined : estado === 'revocados',
      q: q || undefined,
      limit: 300
    })
    filas.value = resultado.dispositivos
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

/** «Restablecer» de la tabla: vuelve a los filtros de entrada. */
function reiniciarFiltros() {
  filtros.value = { puestoId: 'todos', estado: 'todos', q: '' }
}
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
  errorVoz.value = null
  voz.value = null
  dialogoDetalle.value = true
  cargandoDetalle.value = true
  try {
    detalle.value = await api.obtenerDispositivo(dispositivo.id)
  } catch (err) {
    errorDetalle.value = err.message
  } finally {
    cargandoDetalle.value = false
  }
  // La voz va por su propio endpoint: si falla, el resto del detalle sigue.
  await cargarVoz(dispositivo.id)
}

function etiquetaAcceso(tipo) {
  const etiquetas = { activacion: 'Activación', login: 'Inicio', logout: 'Cierre' }
  return etiquetas[tipo] ?? tipo
}

// --- Voz del equipo ---
// La flota es el valor por defecto; aquí se ve qué pisa este aparato. Un campo
// en «heredar» viaja como null y el servidor resuelve con la flota.
const voz = ref(null)
const errorVoz = ref(null)
const guardandoVoz = ref(false)
const formVoz = ref({ motor: 'heredar', idioma: 'heredar', wake: '' })

const opcionesMotorVoz = computed(() => {
  // El reconocedor del sistema es una capacidad fija del aparato: si no lo
  // tiene, Google no se puede elegir. Vosk ya NO es así: el modelo no viaja en
  // la APK y este mismo panel es el que lo dispara, así que «no instalado» es
  // transitorio y deshabilitarlo impediría justo la acción que lo resuelve.
  const sinStt = detalle.value?.vozStt === false
  return [
    {
      label: `Heredar de la flota (${etiquetaMotor(voz.value?.flota?.motor)})`,
      value: 'heredar'
    },
    ...MOTORES_FLOTA.map(opcion => ({
      label: opcion.label,
      value: opcion.id,
      disabled: opcion.id === 'google' && sinStt
    }))
  ]
})

const opcionesIdiomaVoz = computed(() => [
  {
    label: `Heredar de la flota (${etiquetaIdioma(voz.value?.flota?.idioma)})`,
    value: 'heredar'
  },
  ...IDIOMAS_FLOTA.map(opcion => ({ label: opcion.label, value: opcion.id }))
])

/** Motor con el que el equipo dice estar escuchando, en palabras del panel. */
const motorReportado = computed(() => {
  const reportado = detalle.value?.vozMotor
  if (!reportado) return null
  return reportado === 'vosk' ? 'Vosk' : 'Reconocedor del sistema'
})

/** Aviso cuando la preferencia no es lo que el aparato está usando de verdad. */
const avisoMotor = computed(() => {
  const reportado = detalle.value?.vozMotor
  const efectiva = voz.value?.efectiva
  if (!reportado || !efectiva) return null
  const esperado = motorParaServicio(efectiva.motor)
  if (esperado === reportado) return null
  return `Este equipo tiene configurado ${etiquetaMotor(efectiva.motor)}, pero está escuchando con ${motorReportado.value}. Suele ser el fallback: el motor preferido no arrancó.`
})

/** Qué le falta al equipo para poder usar cada motor. */
const capacidadesMotor = computed(() => {
  const partes = []
  // «Sin Vosk» es un aprovisionamiento pendiente, no una limitación: al
  // aplicar el motor, la app descarga el modelo (o se importa en Ajustes).
  if (detalle.value?.vozVosk === false) {
    partes.push('aún no tiene el modelo Vosk (se descargará solo al aplicarlo)')
  }
  if (detalle.value?.vozStt === false) partes.push('no tiene reconocedor del sistema')
  return partes.length ? `Este equipo ${partes.join(' y ')}.` : null
})

async function cargarVoz(id) {
  errorVoz.value = null
  try {
    const respuesta = await api.obtenerVozDispositivo(id)
    voz.value = respuesta
    formVoz.value = {
      motor: respuesta?.override?.motor ?? 'heredar',
      idioma: respuesta?.override?.idioma ?? 'heredar',
      wake: respuesta?.override?.wake ?? ''
    }
  } catch (err) {
    errorVoz.value = err.message
  }
}

function datosVozForm() {
  return {
    motor: formVoz.value.motor === 'heredar' ? null : formVoz.value.motor,
    idioma: formVoz.value.idioma === 'heredar' ? null : formVoz.value.idioma,
    wake: formVoz.value.wake.trim() || null
  }
}

async function guardarVoz() {
  if (guardandoVoz.value || !detalle.value) return
  errorVoz.value = null
  guardandoVoz.value = true
  try {
    const respuesta = await api.guardarVozDispositivo(detalle.value.id, datosVozForm())
    toast.add({
      title: 'Voz del equipo',
      description: respuesta?.efectiva?.origen === 'dispositivo'
        ? 'Guardado: este equipo usa su propia configuración.'
        : 'Guardado: este equipo vuelve a la flota.',
      color: 'success',
      icon: 'i-lucide-check'
    })
    await cargarVoz(detalle.value.id)
    await cargar()
  } catch (err) {
    errorVoz.value = err.message
  } finally {
    guardandoVoz.value = false
  }
}

async function aplicarVozPuesto() {
  if (guardandoVoz.value || !detalle.value?.puestoId) return
  errorVoz.value = null
  guardandoVoz.value = true
  try {
    const respuesta = await api.guardarVozPuesto({
      puestoId: detalle.value.puestoId,
      ...datosVozForm()
    })
    toast.add({
      title: 'Voz del puesto',
      description: `Aplicado a ${respuesta?.aplicados ?? 0} equipo(s) de ${detalle.value.puestoNombre || 'el puesto'}.`,
      color: 'success',
      icon: 'i-lucide-check'
    })
    await cargar()
    await cargarVoz(detalle.value.id)
  } catch (err) {
    errorVoz.value = err.message
  } finally {
    guardandoVoz.value = false
  }
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
    <UAlert
      v-if="errorCarga"
      color="error"
      variant="soft"
      icon="i-lucide-alert-circle"
      :title="errorCarga"
    />

    <BaseTable
      v-model:filters="filtros"
      :data="filas"
      :columns="columnas"
      :loading-prop="cargando"
      :show-edit="false"
      :show-delete="false"
      :filter-fields="camposFiltro"
      empty-state="No hay dispositivos que coincidan"
      @reset="reiniciarFiltros"
      @reload="cargar"
    >
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

      <template #voz-cell="{ row }">
        <UBadge
          :color="row.original.voz?.origen === 'dispositivo' ? 'primary' : 'neutral'"
          :variant="row.original.voz?.origen === 'dispositivo' ? 'soft' : 'outline'"
          size="sm"
          :label="etiquetaMotor(row.original.voz?.motor)"
        />
        <p v-if="row.original.vozMotor" class="mt-1 text-xs text-muted">
          reportó {{ row.original.vozMotor === 'vosk' ? 'Vosk' : 'sistema' }}
        </p>
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

        <section class="space-y-3 rounded-xl border border-default p-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h3 class="font-semibold">
              Voz de este equipo
            </h3>
            <UBadge
              v-if="voz?.efectiva"
              :color="voz.efectiva.origen === 'dispositivo' ? 'primary' : 'neutral'"
              :variant="voz.efectiva.origen === 'dispositivo' ? 'soft' : 'outline'"
              size="sm"
              :label="voz.efectiva.origen === 'dispositivo' ? 'Configuración propia' : 'Hereda de la flota'"
            />
          </div>

          <UAlert
            v-if="errorVoz"
            color="error"
            variant="soft"
            icon="i-lucide-alert-circle"
            :title="errorVoz"
          />
          <UAlert
            v-if="avisoMotor"
            color="warning"
            variant="soft"
            icon="i-lucide-triangle-alert"
            title="El motor configurado no es el que está usando"
            :description="avisoMotor"
          />

          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField label="Motor de reconocimiento" :hint="`En uso: ${motorReportado || 'sin dato'}`">
              <USelect v-model="formVoz.motor" :items="opcionesMotorVoz" class="w-full" />
              <p v-if="capacidadesMotor" class="mt-1 text-xs text-muted">
                {{ capacidadesMotor }}
              </p>
            </UFormField>
            <UFormField label="Idioma">
              <USelect v-model="formVoz.idioma" :items="opcionesIdiomaVoz" class="w-full" />
            </UFormField>
            <UFormField
              label="Palabra clave"
              :hint="`Flota: «${voz?.flota?.wake || '—'}»`"
              class="sm:col-span-2"
            >
              <UInput
                v-model="formVoz.wake"
                placeholder="Vacío = la de la flota"
                :maxlength="40"
                class="w-full"
              />
            </UFormField>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <UButton
              label="Guardar"
              icon="i-lucide-check"
              size="sm"
              :loading="guardandoVoz"
              @click="guardarVoz"
            />
            <UButton
              label="Aplicar a todo el puesto"
              icon="i-lucide-users"
              size="sm"
              color="neutral"
              variant="soft"
              :disabled="!detalle.puestoId"
              :loading="guardandoVoz"
              @click="aplicarVozPuesto"
            />
            <span class="text-xs text-muted">
              Se aplica en el próximo sync (o al instante si el equipo está abierto).
            </span>
          </div>
        </section>

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
