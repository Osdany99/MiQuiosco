<script setup>
/**
 * /recargas/sms — Pantalla de diagnóstico del subsistema de captura.
 *
 * Fase 0: no registra nada todavía. Existe para responder "¿está llegando el
 * SMS?" antes de construir el registro automático. Cuando esto funcione, la
 * Fase 1 se apoya en el mismo camino.
 */
definePageMeta({
  middleware: ['jefe']
})

const toast = useToast()
const sms = useSmsEtecsa()

const barrendo = ref(false)
const ultimoBarrido = ref(null)
const hayPermisoBuzon = ref(false)

const remitenteResumen = computed(() => {
  const mapa = new Map()
  for (const m of sms.mensajes.value) {
    const actual = mapa.get(m.remitente) || { remitente: m.remitente, total: 0 }
    actual.total++
    mapa.set(m.remitente, actual)
  }
  return [...mapa.values()].sort((a, b) => b.total - a.total)
})

function fecha(ms) {
  if (!ms) return '—'
  try {
    return new Date(ms).toLocaleString('es-MX')
  } catch {
    return String(ms)
  }
}

async function recargar() {
  await sms.cargar()
  await sms.refrescarEstado()
}

async function barrer() {
  barrendo.value = true
  try {
    const res = await sms.barrer({ desde: 0 })
    if (res.permisoRequerido) {
      hayPermisoBuzon.value = true
      toast.add({
        title: 'Falta permiso para leer el buzón',
        description: 'Se necesita "SMS" para poder barrer los mensajes que ya estaban en el teléfono.',
        color: 'warning'
      })
      return
    }
    if (!res.mensajes.length) {
      toast.add({
        title: 'Nada nuevo en el buzón',
        description: 'No hay SMS de los remitentes aceptados fuera de la cola.',
        color: 'info'
      })
    }
    await sms.cargar()
    ultimoBarrido.value = Date.now()
  } finally {
    barrendo.value = false
  }
}

async function pedirPermiso() {
  const res = await sms.pedirPermiso()
  if (res.permisoRecibir) {
    toast.add({
      title: 'Permiso concedido',
      description: 'La app ya puede recibir los SMS de recarga.',
      color: 'success'
    })
    await sms.cargar()
    return
  }
  if (res.error) {
    // El diálogo ni siquiera llegó a abrirse: insistir no arregla nada.
    toast.add({
      title: 'No se pudo pedir el permiso',
      description: 'La app no pudo lanzar la ventana de permisos. Cierra y vuelve a abrir la app e inténtalo otra vez.',
      color: 'error'
    })
    return
  }
  toast.add({
    title: 'Permiso denegado',
    description: 'Sin este permiso no se registrarán las recargas. Puedes concederlo en Ajustes del sistema → Apps → MiQuiosco → Permisos → SMS.',
    color: 'warning'
  })
}

async function pedirNotificaciones() {
  const res = await sms.pedirPermisoNotificaciones()
  if (res.notificaciones) {
    toast.add({
      title: 'Avisos activados',
      description: 'La app te avisará cuando entre una recarga nueva.',
      color: 'success'
    })
    return
  }
  toast.add({
    title: 'Avisos no activados',
    description: 'Puedes habilitarlos en Ajustes del sistema → Notificaciones → Mostrar notificaciones.',
    color: 'warning'
  })
}

async function limpiar() {
  await sms.limpiarCola()
  toast.add({ title: 'Cola vaciada', color: 'info' })
}

let soltarResume = null
onMounted(() => {
  recargar()
  soltarResume = sms.observarResume()
})
onUnmounted(() => {
  soltarResume?.()
})
</script>

<template>
  <BaseHeaderPage
    title="SMS de recarga"
    description="Diagnóstico de la captura de confirmaciones de Etecsa"
    leading-icon="i-lucide-message-square-text"
  >
    <template #trailing>
      <UButton
        icon="i-lucide-refresh-cw"
        variant="outline"
        label="Recargar"
        :loading="sms.cargando.value"
        @click="recargar"
      />
    </template>

    <UAlert
      v-if="!sms.estado.value.disponible"
      color="warning"
      variant="soft"
      icon="i-lucide-info"
      title="Solo funciona en la app Android"
      description="Esta pantalla verifica el plugin nativo de captura de SMS. En web no hay nada que diagnosticar."
      class="mb-4"
    />

    <!-- Aviso solo si falta algo. Una vez concedido, esta pantalla queda limpia:
         el módulo ya funciona y la investigación vive en Configuración. -->
    <UAlert
      v-if="!sms.estado.value.disponible"
      color="warning"
      variant="soft"
      icon="i-lucide-info"
      title="Solo funciona en la app Android"
      description="Esta pantalla verifica el plugin nativo de captura de SMS. En web no hay nada que diagnosticar."
      class="mb-4"
    />

    <UAlert
      v-else-if="sms.estado.value.permisoRecibir"
      color="success"
      variant="soft"
      icon="i-lucide-shield-check"
      title="Captura funcionando"
      description="La app recibe las confirmaciones de recarga aunque esté cerrada en segundo plano."
      class="mb-4"
    />

    <UAlert
      v-else
      color="warning"
      variant="soft"
      icon="i-lucide-shield-alert"
      title="Falta el permiso de SMS"
      description="Mientras no esté concedido no se anotarán las recargas automáticamente."
      class="mb-4"
    >
      <template #actions>
        <UButton
          size="xs"
          icon="i-lucide-lock-open"
          label="Desbloquear"
          @click="sms.abrirAjustesPermisos('restringidos')"
        />
        <UButton
          size="xs"
          color="neutral"
          variant="outline"
          label="Conceder"
          @click="pedirPermiso"
        />
      </template>
    </UAlert>

    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
      <UCard>
        <p class="text-xs text-muted">
          En la cola
        </p>
        <p class="text-xl font-bold font-mono">
          {{ sms.estado.value.pendientes }}
        </p>
        <p class="text-xs text-muted">
          esperando a que la app los lea
        </p>
      </UCard>
      <UCard>
        <p class="text-xs text-muted">
          Mostrados
        </p>
        <p class="text-xl font-bold font-mono">
          {{ sms.mensajes.value.length }}
        </p>
        <p class="text-xs text-muted">
          en esta sesión
        </p>
      </UCard>
      <UCard>
        <p class="text-xs text-muted">
          Remitentes
        </p>
        <p class="text-xl font-bold font-mono">
          {{ remitenteResumen.length }}
        </p>
        <p class="text-xs text-muted">
          distintos capturados
        </p>
      </UCard>
    </div>

    <UCard class="mb-4">
      <div class="space-y-3">
        <div>
          <h2 class="text-sm font-medium">
            Remitentes aceptados
          </h2>
          <p class="text-sm text-muted">
            Solo se encolan los SMS de estos emisores. Se detectó que Etecsa
            manda por dos plataformas distintas y cada una con su propio formato.
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <UBadge
            v-for="r in sms.estado.value.remitentes"
            :key="r"
            variant="soft"
            size="sm"
            color="neutral"
          >
            {{ r }}
          </UBadge>
          <span
            v-if="!sms.estado.value.remitentes.length"
            class="text-sm text-muted"
          >
            Ninguno configurado
          </span>
        </div>

        <div class="flex flex-wrap items-center gap-2 pt-1">
          <UButton
            icon="i-lucide-inbox"
            color="neutral"
            variant="outline"
            label="Barrer buzón"
            :loading="barrendo"
            @click="barrer"
          />
          <UButton
            icon="i-lucide-trash-2"
            color="error"
            variant="ghost"
            label="Vaciar cola"
            @click="limpiar"
          />
          <UButton
            icon="i-lucide-bell"
            color="neutral"
            variant="outline"
            label="Permitir avisos"
            @click="pedirNotificaciones"
          />
          <UButton
            icon="i-lucide-lock-open"
            color="neutral"
            variant="outline"
            label="Ajustes restringidos"
            @click="sms.abrirAjustesPermisos('restringidos')"
          />
          <UButton
            icon="i-lucide-settings"
            color="neutral"
            variant="outline"
            label="Permisos de la app"
            @click="sms.abrirAjustesPermisos('permisos')"
          />
        </div>
        <p
          v-if="ultimoBarrido"
          class="text-xs text-muted"
        >
          Último barrido: {{ new Date(ultimoBarrido).toLocaleString('es-MX') }}
        </p>
      </div>
    </UCard>

    <UCard>
      <div class="space-y-3">
        <div class="flex items-center justify-between gap-3">
          <h2 class="text-sm font-medium">
            SMS recibidos
          </h2>
          <UButton
            v-if="sms.mensajes.value.length"
            icon="i-lucide-eraser"
            color="neutral"
            variant="ghost"
            size="xs"
            label="Limpiar lista"
            @click="sms.reiniciar"
          />
        </div>

        <UAlert
          v-if="!sms.mensajes.value.length"
          color="neutral"
          variant="soft"
          icon="i-lucide-inbox"
          title="Todavía no ha llegado ningún SMS"
          description="Haz una recarga desde Transfermóvil o Banco Metropolitano y vuelve a esta pantalla. El mensaje debe aparecer aunque la app esté cerrada."
        />

        <ul
          v-else
          class="divide-y divide-default"
        >
          <li
            v-for="m in sms.mensajes.value"
            :key="m.clave"
            class="py-3"
          >
            <div class="flex items-start justify-between gap-3 mb-1">
              <div class="flex items-center gap-2 min-w-0">
                <UBadge
                  variant="soft"
                  size="sm"
                  color="primary"
                  class="shrink-0"
                >
                  {{ m.remitente }}
                </UBadge>
                <UBadge
                  variant="outline"
                  size="sm"
                  color="neutral"
                  class="shrink-0"
                >
                  {{ m.origen }}
                </UBadge>
              </div>
              <span class="text-xs text-muted shrink-0">
                {{ fecha(m.recibidoEn) }}
              </span>
            </div>
            <pre class="text-xs font-mono whitespace-pre-wrap break-words bg-elevated/40 rounded-md p-2">{{ m.cuerpo }}</pre>
          </li>
        </ul>
      </div>
    </UCard>
  </BaseHeaderPage>
</template>
