<script setup>
/**
 * /clientes — Lista de clientes y sus números.
 *
 * Un cliente puede tener varios teléfonos porque el tope de 360 CUP de Etecsa
 * es POR NÚMERO. El número canónico (10 dígitos) es la clave con la que se
 * empareja cada recarga que entra, por eso se gestiona aquí y no suelta.
 */
import { clientes as config } from '../../shared/tables'
import { normalizarTelefono } from '../utils/parseEtecsaSms'
import {
  contactosEstado,
  contactosListar,
  contactosPedirPermiso
} from '../utils/contactos'

definePageMeta({
  middleware: ['jefe']
})

const toast = useToast()
const auth = useAuth()
const cli = useClientes()
const tablaRef = ref(null)

const pid = computed(() => auth.usuarioActual.value?.puestoId ?? null)

const columnas = [
  { accessorKey: 'id', header: 'ID', visible: false },
  { accessorKey: 'nombre', header: 'Cliente' },
  { accessorKey: 'telefonos', header: 'Teléfonos' },
  { accessorKey: 'notas', header: 'Notas', visible: false },
  { accessorKey: 'activo', header: 'Estado', cell: 'activation' },
  { accessorKey: 'acciones', header: '' }
]

const filterFields = [
  { key: 'nombre', label: 'Cliente', type: 'text' },
  {
    key: 'activo',
    label: 'Estado',
    type: 'select',
    options: [
      { label: 'Activo', value: 'true' },
      { label: 'Inactivo', value: 'false' }
    ]
  }
]

const dialogo = ref(false)
const editando = ref(null)
const guardando = ref(false)
const form = ref({ id: null, nombre: '', notas: '', activo: true })
const formErrores = ref({})
const telefonosForm = ref([])
const nuevoTelefono = ref('')

const dialogoImportar = ref(false)
const contactos = ref([])
const cargandoContactos = ref(false)
const permisoContactos = ref(false)
const restringido = ref(false)

const importando = ref(false)
const progreso = ref(null)

const dialogoDeudas = ref(false)
const viendoDeudas = ref(null)

function telefonosDe(clienteId) {
  return cli.telefonos.value.filter(t => t.clienteId === clienteId && t.activo !== false)
}

async function abrirNuevo() {
  editando.value = null
  form.value = { id: null, nombre: '', notas: '', activo: true }
  formErrores.value = {}
  telefonosForm.value = []
  nuevoTelefono.value = ''
  dialogo.value = true
}

async function abrirEditar(cliente) {
  editando.value = cliente
  form.value = { id: cliente.id, nombre: cliente.nombre ?? '', notas: cliente.notas ?? '', activo: cliente.activo !== false }
  formErrores.value = {}
  telefonosForm.value = telefonosDe(cliente.id).map(t => ({ id: t.id, telefono: t.telefono }))
  nuevoTelefono.value = ''
  dialogo.value = true
}

function abrirDeudas(cliente) {
  viendoDeudas.value = cliente
  dialogoDeudas.value = true
}

function agregarTelefono() {
  const canon = normalizarTelefono(nuevoTelefono.value)
  nuevoTelefono.value = ''
  if (!canon || canon.length !== 10) {
    toast.add({ title: 'Número inválido', description: 'Se esperan 8 o 10 dígitos.', color: 'warning' })
    return
  }
  if (telefonosForm.value.some(t => t.telefono === canon)) return
  const ocupado = cli.buscarPorTelefono(canon)
  if (ocupado) {
    toast.add({
      title: 'Ese número ya tiene dueño',
      description: 'Un número no puede pertenecer a dos clientes.',
      color: 'warning'
    })
    return
  }
  telefonosForm.value.push({ telefono: canon })
}

function quitarTelefono(t) {
  telefonosForm.value = telefonosForm.value.filter(x => x.telefono !== t.telefono)
}

async function guardar() {
  const nombre = form.value.nombre.trim()
  if (!nombre) {
    formErrores.value = { nombre: 'El nombre es requerido' }
    return
  }
  guardando.value = true
  try {
    let cliente
    if (form.value.id) {
      cliente = await cli.clientesRepo.value.patch(form.value.id, {
        nombre,
        notas: form.value.notas || null,
        activo: form.value.activo !== false
      })
    } else {
      cliente = await cli.crearCliente(
        { nombre, notas: form.value.notas || null },
        pid.value
      )
    }

    // Los teléfonos se sincronizan por diferencia: los que estaban y ya no
    // quedan se desactivan en vez de borrarse (histórico de recargas).
    const previos = form.value.id ? telefonosDe(cliente.id) : []
    const deseados = telefonosForm.value.map(t => t.telefono)
    for (const p of previos) {
      if (!deseados.includes(p.telefono)) {
        await cli.desvincularTelefono(p.id)
      }
    }
    for (const t of telefonosForm.value) {
      if (!previos.some(p => p.telefono === t.telefono)) {
        await cli.agregarTelefono(cliente.id, t.telefono, pid.value)
      }
    }

    dialogo.value = false
    toast.add({ title: form.value.id ? 'Cliente actualizado' : 'Cliente creado', color: 'success' })
    await tablaRef.value?.refresh()
  } catch (e) {
    toast.add({ title: 'No se pudo guardar', description: e?.message, color: 'error' })
  } finally {
    guardando.value = false
  }
}

// --------------------------------------------------------------- contactos

async function leerPermiso() {
  const st = await contactosEstado()
  permisoContactos.value = st.permiso
  restringido.value = st.restringido
  return st.permiso
}

async function pedirPermisoContactos() {
  const res = await contactosPedirPermiso()
  await leerPermiso()
  if (res.permiso) {
    toast.add({ title: 'Contactos permitidos', color: 'success' })
    await abrirImportar()
  } else {
    toast.add({
      title: 'No se concedió el permiso',
      description: restringido.value
        ? 'Primero activa "Permitir ajustes restringidos" en Ajustes del sistema; si no, el permiso aparece bloqueado.'
        : 'Puedes activarlo en Ajustes → Apps → MiQuiosco → Permisos → Contactos.',
      color: 'warning'
    })
  }
}

async function abrirImportar() {
  if (!await leerPermiso()) {
    pedirPermisoContactos()
    return
  }
  dialogoImportar.value = true
  if (contactos.value.length) return
  cargandoContactos.value = true
  try {
    const r = await contactosListar()
    contactos.value = r.contactos
  } finally {
    cargandoContactos.value = false
  }
}

const ocupados = computed(() => cli.telefonos.value.filter(t => t.activo !== false).map(t => t.telefono))

/**
 * Importa contactos por tandas cediendo el hilo entre una y otra.
 *
 * El driver inserta fila a fila, así que con 150 contactos son ~300 escrituras:
 * hacerlo de un tirón deja la app varios segundos sin pintar nada y parece
 * colgada. Procesar en lotes de 8 y soltar el hilo con `nextTick` + un tick de
 * temporizador hace que la barra del diálogo avance de verdad.
 *
 * Cada contacto es todo o nada: si se crea el cliente pero fallan sus números,
 * se elimina el recién creado (compensa) para no dejar clientes huérfanos sin
 * números. Y si el contacto ya existe por nombre (reintento tras un corte a
 * mitad), se reutiliza en vez de duplicarlo.
 */
async function importarContactos(lista) {
  importando.value = true
  progreso.value = { hechos: 0, total: lista.length, clientes: 0, numeros: 0, omitidos: 0 }

  const TANDAS = 8
  for (let i = 0; i < lista.length; i += TANDAS) {
    for (const c of lista.slice(i, i + TANDAS)) {
      try {
        const nombreNorm = String(c.nombre ?? '').trim().toLowerCase()
        let cliente = cli.clientes.value.find(x => String(x.nombre ?? '').trim().toLowerCase() === nombreNorm) ?? null
        let creado = false
        if (!cliente) {
          cliente = await cli.crearCliente({ nombre: c.nombre }, pid.value)
          creado = true
        }
        const numerosAntes = cli.telefonosDe(cliente.id).length
        let numerosNuevos = 0
        for (const t of c.telefonos) {
          if (ocupados.value.includes(t)) {
            progreso.value.omitidos++
            continue
          }
          await cli.agregarTelefono(cliente.id, t, pid.value)
          progreso.value.numeros++
          numerosNuevos++
        }
        if (creado) {
          if (numerosAntes + numerosNuevos === 0) {
            // Compensación: el cliente quedó huérfano (todos sus números
            // fallaron u ocupados). Se elimina para no dejar basura.
            await cli.clientesRepo.value.remove(cliente.id)
            const idx = cli.clientes.value.findIndex(x => x.id === cliente.id)
            if (idx >= 0) cli.clientes.value.splice(idx, 1)
            progreso.value.omitidos++
          } else {
            progreso.value.clientes++
          }
        }
      } catch {
        progreso.value.omitidos++
      }
    }
    progreso.value.hechos = Math.min(i + TANDAS, lista.length)
    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))
  }

  importando.value = false
  await tablaRef.value?.refresh()
}

/**
 * Los datos del cliente (teléfonos sobre todo) se cargan en cuanto se conoce
 * el puesto, no en el onMounted: al arrancar la app la sesión puede que aún no
 * esté resuelta y `puestoId` llegue null, con lo que la tabla se pintaría
 * como "sin números".
 */
watch(pid, async (valor) => {
  if (!valor) return
  await cli.cargarTelefonos()
  await cli.cargarClientes(valor)
}, { immediate: true })

onMounted(() => {
  leerPermiso()
})
</script>

<template>
  <BaseHeaderPage
    title="Clientes"
    description="Clientes del negocio y sus números"
    leading-icon="i-lucide-users"
    title-button="Nuevo cliente"
    @new="abrirNuevo"
  >
    <template #trailing>
      <UButton
        icon="i-lucide-contact-round"
        variant="outline"
        label="Importar contactos"
        @click="abrirImportar"
      />
    </template>

    <UAlert
      v-if="!pid"
      color="warning"
      variant="soft"
      icon="i-lucide-triangle-alert"
      title="Sin puesto identificado"
      description="Inicia sesión con un jefe para ver los clientes."
      class="mb-4"
    />

    <UAlert
      v-else-if="!permisoContactos"
      color="neutral"
      variant="soft"
      icon="i-lucide-contact-round"
      title="Importar contactos del teléfono"
      :description="restringido
        ? 'La app está instalada fuera de Google Play: activa primero «Permitir ajustes restringidos» en Ajustes del sistema.'
        : 'Concede el permiso de Contactos para crear clientes desde la agenda del teléfono.'"
      class="mb-4"
    >
      <template #actions>
        <UButton
          size="xs"
          icon="i-lucide-lock-open"
          label="Permitir contactos"
          @click="pedirPermisoContactos"
        />
      </template>
    </UAlert>

    <BaseTable
      ref="tablaRef"
      :config="config"
      :columns="columnas"
      :filter-fields="filterFields"
      :search="''"
      empty-state="No hay clientes todavía"
      :show-edit="false"
      :show-delete="false"
    >
      <template #nombre-cell="{ row }">
        <div class="min-w-0">
          <p class="truncate font-medium">
            {{ row.original.nombre }}
          </p>
          <p
            v-if="row.original.notas"
            class="truncate text-xs text-muted"
          >
            {{ row.original.notas }}
          </p>
        </div>
      </template>

      <template #telefonos-cell="{ row }">
        <div class="flex flex-wrap gap-1">
          <UBadge
            v-for="t in telefonosDe(row.original.id)"
            :key="t.id"
            variant="soft"
            size="sm"
            color="primary"
            class="font-mono"
            :label="t.telefono"
          />
          <span
            v-if="!telefonosDe(row.original.id).length"
            class="text-xs text-muted"
          >
            sin números
          </span>
        </div>
      </template>

      <template #acciones-cell="{ row }">
        <div class="flex gap-1 justify-end">
          <UTooltip text="Ver deudas" :delay-duration="0">
            <UButton
              size="xs"
              icon="i-lucide-hand-coins"
              color="neutral"
              variant="ghost"
              aria-label="Ver deudas"
              @click="abrirDeudas(row.original)"
            />
          </UTooltip>
          <UTooltip text="Editar" :delay-duration="0">
            <UButton
              size="xs"
              icon="i-lucide-pencil"
              color="neutral"
              variant="ghost"
              aria-label="Editar"
              @click="abrirEditar(row.original)"
            />
          </UTooltip>
        </div>
      </template>
    </BaseTable>

    <BaseDialog
      v-model="dialogo"
      :title="form.id ? 'Editar cliente' : 'Nuevo cliente'"
      confirm-text="Guardar"
      :loading="guardando"
      @confirm="guardar"
      @cancel="dialogo = false"
    >
      <div class="space-y-4">
        <UFormField
          label="Nombre"
          required
          :error="formErrores.nombre"
        >
          <UInput
            v-model="form.nombre"
            placeholder="Ej. Marta la de la esquina"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Notas">
          <UInput
            v-model="form.notas"
            placeholder="Opcional"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Estado">
          <USwitch
            v-model="form.activo"
            label="Activo"
          />
        </UFormField>

        <div>
          <p class="mb-2 text-sm font-medium">
            Teléfonos
          </p>
          <p class="mb-2 text-xs text-muted">
            Se guardan en 10 dígitos. El límite de 360 CUP de Etecsa es por
            número, así que un cliente puede tener varios.
          </p>

          <ul
            v-if="telefonosForm.length"
            class="mb-2 space-y-1"
          >
            <li
              v-for="t in telefonosForm"
              :key="t.telefono"
              class="flex items-center justify-between rounded-md border border-default px-2 py-1"
            >
              <span class="font-mono text-sm">{{ t.telefono }}</span>
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-lucide-x"
                aria-label="Quitar"
                @click="quitarTelefono(t)"
              />
            </li>
          </ul>

          <div class="flex gap-2">
            <UInput
              v-model="nuevoTelefono"
              placeholder="Número"
              inputmode="numeric"
              class="w-full"
              @keyup.enter="agregarTelefono"
            />
            <UButton
              icon="i-lucide-plus"
              variant="soft"
              label="Añadir"
              @click="agregarTelefono"
            />
          </div>
        </div>
      </div>
    </BaseDialog>

    <ClientesDialogoDeudasCliente
      v-model="dialogoDeudas"
      :cliente="viendoDeudas"
    />

    <ClientesDialogoImportarContactos
      v-model="dialogoImportar"
      :contactos="contactos"
      :cargando="cargandoContactos"
      :ocupados="ocupados"
      :importando="importando"
      :progreso="progreso"
      @importar="importarContactos"
    />
  </BaseHeaderPage>
</template>
