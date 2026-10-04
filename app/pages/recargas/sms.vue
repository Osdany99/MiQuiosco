<script setup>
/**
 * /recargas/sms — Bandeja de recargas por confirmar.
 *
 * Cada SMS de confirmación se parsea al llegar y deja una fila aquí con los
 * datos ya extraídos (nada de texto crudo). La recarga NO entra al historial
 * sola: hay que decidir si se pagó o queda fiada, y a qué cliente se le
 * imputa.
 */
definePageMeta({
  middleware: ['jefe']
})

const toast = useToast()
const auth = useAuth()
const sms = useSmsEtecsa()
const rec = useRecargas()

const barrendo = ref(false)
const guardando = ref(false)
const ultimoBarrido = ref(null)

const confirmando = ref(null)
const dialogoConfirmar = ref(false)
const asignando = ref(null)
const dialogoAsignar = ref(false)

const pid = computed(() => auth.usuarioActual.value?.puestoId ?? null)

const clienteDe = (p) => {
  if (!p) return null
  const tel = rec.cli.buscarPorTelefono(p.telefonoDestino)
  if (tel) return rec.cli.clientes.value.find(c => c.id === tel.clienteId) ?? null
  return rec.cli.clientes.value.find(c => c.id === p.clienteId) ?? null
}

const nombreCliente = p => clienteDe(p)?.nombre ?? null

const totales = computed(() => ({
  cantidad: rec.pendientes.value.length,
  nominal: rec.pendientes.value.reduce((s, p) => s + Number(p.montoNominal ?? 0), 0),
  ganancia: rec.pendientes.value.reduce((s, p) => s + Number(p.ganancia ?? 0), 0),
  sinCliente: rec.pendientes.value.filter(p => !clienteDe(p)).length
}))

function fecha(ms) {
  if (!ms) return '—'
  try {
    return new Date(ms).toLocaleString('es-MX')
  } catch {
    return String(ms)
  }
}

function tipoLegible(p) {
  if (p.tipo === 'saldo') return 'Saldo'
  const u = p.tipo === 'voz' ? 'min' : (p.tipo === 'sms' ? 'SMS' : 'und')
  return `${p.unidades ?? ''} ${u}`.trim()
}

async function recargar() {
  if (!pid.value) return
  await rec.cli.cargarClientes(pid.value)
  await rec.cli.cargarTelefonos()
  await rec.cargarPendientes()
  await sms.refrescarEstado()
}

async function barrer() {
  barrendo.value = true
  try {
    const res = await sms.barrer({ desde: 0 })
    if (res.permisoRequerido) {
      toast.add({
        title: 'Falta permiso para leer el buzón',
        description: 'Concede el permiso de SMS en Configuración para poder barrer los mensajes que ya estaban en el teléfono.',
        color: 'warning'
      })
      return
    }
    // Lo que devuelve el barrido queda en la cola nativa; cargar() la drena y
    // la pasa por el pipeline. Lo que ya esté en el historial se descarta.
    const stats = await sms.cargar()
    ultimoBarrido.value = Date.now()
    const nuevas = stats?.pendientes ?? 0
    toast.add(
      nuevas > 0
        ? { title: `${nuevas} recarga(s) en la bandeja`, color: 'success' }
        : { title: 'Nada nuevo en el buzón', color: 'info' }
    )
    await recargar()
  } finally {
    barrendo.value = false
  }
}

function abrirConfirmar(p) {
  if (!clienteDe(p)) {
    abrirAsignar(p)
    return
  }
  confirmando.value = p
  dialogoConfirmar.value = true
}

async function onConfirmar(estadoPago) {
  const p = confirmando.value
  const cliente = clienteDe(p)
  if (!p || !cliente) return
  guardando.value = true
  try {
    await rec.confirmar(p.id, { clienteId: cliente.id, estadoPago })
    dialogoConfirmar.value = false
    confirmando.value = null
    toast.add({
      title: estadoPago === 'pagada' ? 'Recarga registrada como pagada' : 'Recarga registrada como deuda',
      color: 'success'
    })
  } catch (e) {
    toast.add({ title: 'No se pudo registrar', description: e?.message, color: 'error' })
  } finally {
    guardando.value = false
  }
}

function abrirAsignar(p) {
  asignando.value = p
  dialogoAsignar.value = true
}

async function onAsignar(clienteId) {
  const p = asignando.value
  if (!p) return
  try {
    // Vincular el número es lo que hace que la SIGUIENTE recarga a ese número
    // entre ya asignada sola.
    await rec.cli.asignarTelefonoA(p.telefonoDestino, clienteId, pid.value)
    dialogoAsignar.value = false
    asignando.value = null
    toast.add({ title: 'Cliente asignado', color: 'success' })
  } catch (e) {
    toast.add({ title: 'No se pudo asignar', description: e?.message, color: 'error' })
  }
}

async function onCrearCliente({ nombre }) {
  const p = asignando.value
  if (!p) return
  try {
    const { cliente } = await rec.cli.crearClienteConTelefono(
      { nombre, telefono: p.telefonoDestino },
      pid.value
    )
    dialogoAsignar.value = false
    asignando.value = null
    toast.add({ title: `Cliente "${cliente.nombre}" creado`, color: 'success' })
  } catch (e) {
    toast.add({ title: 'No se pudo crear', description: e?.message, color: 'error' })
  }
}

// Igual que en /recargas: se espera a conocer el puesto. Si se carga en el
// mount y la sesión todavía no está, la bandeja sale sin nombres de cliente.
watch(pid, recargar, { immediate: true })

let soltarResume = null
onMounted(() => {
  soltarResume = sms.observarResume()
})
onUnmounted(() => soltarResume?.())
</script>

<template>
  <BaseHeaderPage
    title="Recargas por confirmar"
    description="Llegan solas; tú decides cuáles pasan al historial"
    leading-icon="i-lucide-message-square-text"
  >
    <template #trailing>
      <UButton
        icon="i-lucide-inbox"
        variant="outline"
        label="Barrer buzón"
        :loading="barrendo"
        @click="barrer"
      />
      <UButton
        icon="i-lucide-refresh-cw"
        variant="outline"
        label="Recargar"
        :loading="rec.cargando.value"
        @click="recargar"
      />
    </template>

    <UAlert
      v-if="!sms.estado.value.disponible"
      color="neutral"
      variant="soft"
      icon="i-lucide-info"
      title="Solo funciona en la app Android"
      description="La captura de SMS vive en el teléfono. En web esta pantalla no tiene nada que mostrar."
      class="mb-4"
    />

    <UAlert
      v-else-if="!sms.estado.value.permisoRecibir"
      color="warning"
      variant="soft"
      icon="i-lucide-shield-alert"
      title="Falta el permiso de SMS"
      description="Sin él no llegan las confirmaciones de recarga. Puedes concederlo en Configuración."
      class="mb-4"
    >
      <template #actions>
        <UButton
          size="xs"
          icon="i-lucide-settings"
          label="Ir a Configuración"
          @click="navigateTo('/settings')"
        />
      </template>
    </UAlert>

    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
      <UCard>
        <p class="text-xs text-muted">
          Por confirmar
        </p>
        <p class="text-xl font-bold font-mono">
          {{ totales.cantidad }}
        </p>
      </UCard>
      <UCard>
        <p class="text-xs text-muted">
          Importe
        </p>
        <p class="text-xl font-bold font-mono">
          {{ totales.nominal }}
        </p>
      </UCard>
      <UCard>
        <p class="text-xs text-muted">
          Ganancia
        </p>
        <p class="text-xl font-bold font-mono text-success">
          +{{ totales.ganancia }}
        </p>
      </UCard>
      <UCard>
        <p class="text-xs text-muted">
          Sin cliente
        </p>
        <p class="text-xl font-bold font-mono" :class="totales.sinCliente ? 'text-warning' : ''">
          {{ totales.sinCliente }}
        </p>
      </UCard>
    </div>

    <UCard>
      <div class="space-y-3">
        <div class="flex items-center justify-between gap-3">
          <h2 class="text-sm font-medium">
            Bandeja
          </h2>
          <p
            v-if="ultimoBarrido"
            class="text-xs text-muted"
          >
            Último barrido: {{ new Date(ultimoBarrido).toLocaleString('es-MX') }}
          </p>
        </div>

        <UAlert
          v-if="!rec.pendientes.value.length"
          color="neutral"
          variant="soft"
          icon="i-lucide-inbox"
          title="No hay recargas por confirmar"
          description="Hacen una recarga en Banco Metropolitano y aparecerá aquí sola. Si no aparece, usa 'Barrer buzón'."
        />

        <ul
          v-else
          class="divide-y divide-default"
        >
          <li
            v-for="p in rec.pendientes.value"
            :key="p.id"
            class="py-3"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <UBadge
                    variant="soft"
                    size="sm"
                    color="primary"
                    class="font-mono"
                    :label="p.telefonoDestino"
                  />
                  <UBadge
                    variant="outline"
                    size="sm"
                    color="neutral"
                    :label="tipoLegible(p)"
                  />
                  <UBadge
                    variant="soft"
                    size="sm"
                    :color="clienteDe(p) ? 'success' : 'warning'"
                    :label="nombreCliente(p) ?? 'Sin cliente'"
                  />
                </div>
                <p class="text-xs text-muted mt-1">
                  {{ fecha(p.recibidoEn) }}
                  <template v-if="p.idTransaccion">
                    · {{ p.idTransaccion }}
                  </template>
                </p>
              </div>

              <div class="text-right shrink-0">
                <p class="text-sm font-bold font-mono">
                  {{ Number(p.montoNominal) }} CUP
                </p>
                <p class="text-xs text-success font-mono">
                  +{{ Number(p.ganancia) }}
                </p>
                <div class="flex flex-col gap-1 mt-1 items-end">
                  <UButton
                    size="xs"
                    icon="i-lucide-plus"
                    label="Añadir al historial"
                    :disabled="!clienteDe(p)"
                    @click="abrirConfirmar(p)"
                  />
                  <UButton
                    v-if="!clienteDe(p)"
                    size="xs"
                    color="warning"
                    variant="soft"
                    label="Asignar cliente"
                    @click="abrirAsignar(p)"
                  />
                </div>
              </div>
            </div>
          </li>
        </ul>
      </div>
    </UCard>

    <RecargasDialogoConfirmarRecarga
      v-model="dialogoConfirmar"
      :recarga="confirmando"
      :cliente="nombreCliente(confirmando) ?? ''"
      :guardando="guardando"
      @confirmar="onConfirmar"
    />

    <RecargasDialogoAsignarCliente
      v-model="dialogoAsignar"
      :telefono="asignando?.telefonoDestino ?? ''"
      :monto-nominal="Number(asignando?.montoNominal ?? 0)"
      :clientes="rec.cli.clientes.value"
      @asignar="onAsignar"
      @crear="onCrearCliente"
    />
  </BaseHeaderPage>
</template>
