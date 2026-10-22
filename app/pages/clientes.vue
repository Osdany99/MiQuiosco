<script setup>
/**
 * /clientes — Lista de clientes y sus números.
 *
 * Un cliente puede tener varios teléfonos porque el tope de 360 CUP de Etecsa
 * es POR NÚMERO. El número canónico (10 dígitos) es la clave con la que se
 * empareja cada recarga que entra, por eso se gestiona aquí y no suelta.
 */
import { clientes as config } from '../../shared/tables'
import { CLIENTE_SIN_CLIENTE_ID_FIJO } from '../../shared/constants'
import { normalizarTelefono } from '../utils/parseEtecsaSms'
import { normalizarNombre } from '#shared/clientes'
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

const dialogoFusionar = ref(false)
const fusionando = ref(false)

const dialogoMover = ref(false)
const telefonoAMover = ref(null)

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
  telefonosForm.value = telefonosDe(cliente.id).map(t => ({
    id: t.id,
    clienteId: t.clienteId,
    telefono: t.telefono,
    etiqueta: t.etiqueta ?? ''
  }))
  nuevoTelefono.value = ''
  dialogo.value = true
}

function abrirDeudas(cliente) {
  viendoDeudas.value = cliente
  dialogoDeudas.value = true
}

/**
 * Añade un número al formulario. Si ya tiene dueño no se rechaza: se marca y
 * se avisa. Un número puede cambiar de cliente, pero el cambio se consuma al
 * guardar (y el aviso lo dice), no en silencio al teclearlo.
 */
function agregarTelefono() {
  const canon = normalizarTelefono(nuevoTelefono.value)
  nuevoTelefono.value = ''
  if (!canon || canon.length !== 10) {
    toast.add({ title: 'Número inválido', description: 'Se esperan 8 o 10 dígitos.', color: 'warning' })
    return
  }
  if (telefonosForm.value.some(t => t.telefono === canon)) return

  const ocupado = cli.buscarPorTelefono(canon)
  if (ocupado && ocupado.clienteId !== form.value.id) {
    const dueno = cli.clientes.value.find(c => c.id === ocupado.clienteId)
    telefonosForm.value.push({
      telefono: canon,
      etiqueta: '',
      ocupadoPor: dueno?.nombre ?? 'otro cliente'
    })
    toast.add({
      title: `Ese número pertenece a «${dueno?.nombre ?? 'otro cliente'}»`,
      description: 'Si guardas, el número se moverá a este cliente.',
      color: 'warning'
    })
    return
  }
  telefonosForm.value.push({ telefono: canon, etiqueta: '' })
}

function quitarTelefono(t) {
  telefonosForm.value = telefonosForm.value.filter(x => x.telefono !== t.telefono)
}

function abrirMover(t) {
  telefonoAMover.value = t
  dialogoMover.value = true
}

/** Se aplica al momento: el número ya no pertenece al cliente que se edita. */
async function moverTelefono(clienteId) {
  const t = telefonoAMover.value
  if (!t?.id) return
  try {
    await cli.moverTelefono(t.id, clienteId)
    const destino = cli.clientes.value.find(c => c.id === clienteId)
    // Si el número estaba en el formulario del cliente actual, sale de él:
    // guardar después no debe volver a moverlo.
    telefonosForm.value = telefonosForm.value.filter(x => x.id !== t.id)
    dialogoMover.value = false
    telefonoAMover.value = null
    toast.add({
      title: 'Número movido',
      description: destino ? `Ahora pertenece a «${destino.nombre}».` : undefined,
      color: 'success'
    })
  } catch (e) {
    toast.add({ title: 'No se pudo mover', description: e?.message, color: 'error' })
  }
}

/** Clientes con nombre parecido al que se está escribiendo (solo aviso). */
const similaresForm = computed(() => {
  const nombre = form.value.nombre?.trim()
  if (!nombre || nombre.length < 3) return []
  return cli.clientesParecidos(nombre, { excluirId: form.value.id }).slice(0, 3)
})

/**
 * El cliente centinela no se renombra ni se desactiva: su nombre es la única
 * señal de que esa transferencia no tiene dueño conocido, y desactivarlo lo
 * saca del selector de transferencias (ver cargarClientes). El ensure-on-use
 * lo reviviría, pero mejor que no haya forma de romperlo.
 */
const esCentinela = computed(() => form.value.id === CLIENTE_SIN_CLIENTE_ID_FIJO)

async function guardar() {
  const nombre = form.value.nombre.trim()
  if (!nombre) {
    formErrores.value = { nombre: 'El nombre es requerido' }
    return
  }

  // Los nombres son la identidad del cliente: dos "Cheila" activos son el
  // mismo cliente partido en dos y es justo lo que la fusión viene a arreglar.
  if (!esCentinela.value) {
    const canon = normalizarNombre(nombre)
    const duplicado = cli.clientes.value.find(
      c => c.id !== form.value.id && normalizarNombre(c.nombre) === canon
    )
    if (duplicado) {
      formErrores.value = { nombre: `Ya existe «${duplicado.nombre}». Edítalo o fusiónalos.` }
      return
    }
  }

  guardando.value = true
  try {
    let cliente
    if (form.value.id) {
      cliente = await cli.clientesRepo.value.patch(form.value.id, esCentinela.value
        ? { notas: form.value.notas || null }
        : {
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
      const etiqueta = t.etiqueta?.trim() || null
      const previo = previos.find(p => p.telefono === t.telefono)
      if (!previo) {
        await cli.agregarTelefono(cliente.id, t.telefono, pid.value, etiqueta)
      } else if ((previo.etiqueta ?? null) !== etiqueta) {
        await cli.telefonosRepo.value.patch(previo.id, { etiqueta })
      }
    }

    // El número pudo cambiar de dueño al guardar: refresca alias y dueños.
    await cli.cargarTelefonos()

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
  progreso.value = null
  dialogoImportar.value = true
  if (contactos.value.length) {
    // La agenda está cacheada, pero los dueños de los números pueden haber
    // cambiado desde la última importación.
    await cli.cargarTelefonos()
    return
  }
  cargandoContactos.value = true
  try {
    const r = await contactosListar()
    contactos.value = r.contactos
  } finally {
    cargandoContactos.value = false
  }
}

// Al cerrar se borra el resumen: al volver a abrir se ve la vista previa.
watch(dialogoImportar, (abierto) => {
  if (!abierto && !importando.value) progreso.value = null
})

/**
 * Aplica el plan que devuelve el diálogo de importación.
 *
 * El plan ya viene decidido (un bloque por cliente final, con sus números y su
 * `etiqueta`): aquí solo se crea/reutiliza el cliente y se asignan los números.
 * Un número ocupado se mueve reutilizando su fila (UNIQUE), y el contador lo
 * separa de los que entraban libres para que el resumen diga la verdad.
 *
 * Se procesa por tandas cediendo el hilo: el driver inserta fila a fila y con
 * ~150 contactos hacerlo de un tirón deja la app sin pintar varios segundos.
 */
async function importarContactos(plan) {
  importando.value = true
  progreso.value = { hechos: 0, total: plan.length, clientes: 0, numeros: 0, movidos: 0, omitidos: 0 }

  const TANDAS = 4
  for (let i = 0; i < plan.length; i += TANDAS) {
    for (const bloque of plan.slice(i, i + TANDAS)) {
      let creado = false
      try {
        let cliente = bloque.clienteId
          ? cli.clientes.value.find(c => c.id === bloque.clienteId) ?? null
          : null

        // Reintento tras un corte: el cliente ya existe con ese nombre.
        if (!cliente) {
          const canon = normalizarNombre(bloque.nombre)
          cliente = cli.clientes.value.find(c => normalizarNombre(c.nombre) === canon) ?? null
        }
        if (!cliente) {
          cliente = await cli.crearCliente({ nombre: bloque.nombre }, pid.value)
          creado = true
        }

        let aplicados = 0
        for (const n of bloque.numeros) {
          const dueno = cli.buscarPorTelefono(n.telefono)
          const esDeOtro = !!dueno && dueno.clienteId !== cliente.id
          await cli.agregarTelefono(cliente.id, n.telefono, pid.value, n.etiqueta || null)
          if (esDeOtro) progreso.value.movidos++
          else progreso.value.numeros++
          aplicados++
        }

        if (creado) {
          if (!aplicados) {
            // Compensación: el cliente quedó huérfano.
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
    progreso.value.hechos = Math.min(i + TANDAS, plan.length)
    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))
  }

  importando.value = false
  await cli.cargarTelefonos()
  if (pid.value) await cli.cargarClientes(pid.value)
  await tablaRef.value?.refresh()
}

/** Fusiona los clientes elegidos y refresca la lista con el resultado. */
async function fusionarClientes({ ids, nombreFinal }) {
  fusionando.value = true
  try {
    const res = await cli.fusionarClientes({ ids, nombreFinal })
    const r = res?.resumen
    dialogoFusionar.value = false
    toast.add({
      title: `Fusionados en «${nombreFinal}»`,
      description: r
        ? `${r.telefonos} número(s), ${r.recargas} recarga(s) y ${r.deudas} deuda(s) re-apuntados.`
        : undefined,
      color: 'success'
    })
    await tablaRef.value?.refresh()
  } catch (e) {
    toast.add({
      title: 'No se pudo fusionar',
      description: e?.data?.statusMessage ?? e?.message,
      color: 'error'
    })
  } finally {
    fusionando.value = false
  }
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
        icon="i-lucide-merge"
        variant="outline"
        label="Fusionar"
        @click="dialogoFusionar = true"
      />
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
          <div
            v-for="t in telefonosDe(row.original.id)"
            :key="t.id"
            class="flex items-center gap-1 rounded-md bg-elevated px-1.5 py-0.5"
          >
            <span class="font-mono text-xs">{{ t.telefono }}</span>
            <span
              v-if="t.etiqueta"
              class="text-[11px] text-muted"
            >· {{ t.etiqueta }}</span>
          </div>
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
            :disabled="esCentinela"
          />
        </UFormField>

        <UAlert
          v-if="similaresForm.length"
          color="warning"
          variant="soft"
          icon="i-lucide-users"
          title="Ya hay clientes con un nombre parecido"
          :description="`${similaresForm.map(s => s.cliente.nombre).join(', ')}. Si es la misma persona, usa «Fusionar» en vez de crear otro.`"
        />

        <UFormField
          v-if="esCentinela"
          label="Cliente centinela"
        >
          <p class="text-xs text-muted">
            Es el cliente que usan las transferencias cuyo cliente no se conoce o se olvidó. No se renombra ni se desactiva: su nombre es la señal de que esa transferencia no tiene dueño.
          </p>
        </UFormField>

        <UFormField
          v-if="!esCentinela"
          label="Notas"
        >
          <UInput
            v-model="form.notas"
            placeholder="Opcional"
            class="w-full"
          />
        </UFormField>

        <UFormField v-if="!esCentinela" label="Estado">
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
            class="mb-2 space-y-2"
          >
            <li
              v-for="t in telefonosForm"
              :key="t.telefono"
              class="space-y-1 rounded-md border border-default px-2 py-1.5"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="font-mono text-sm">{{ t.telefono }}</span>
                <div class="flex gap-1">
                  <UTooltip
                    v-if="t.id"
                    text="Mover a otro cliente"
                    :delay-duration="0"
                  >
                    <UButton
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      icon="i-lucide-arrow-right-left"
                      aria-label="Mover a otro cliente"
                      @click="abrirMover(t)"
                    />
                  </UTooltip>
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    icon="i-lucide-x"
                    aria-label="Quitar"
                    @click="quitarTelefono(t)"
                  />
                </div>
              </div>
              <UInput
                v-model="t.etiqueta"
                size="sm"
                placeholder="Nombre del número (opcional)"
                class="w-full"
              />
              <p
                v-if="t.ocupadoPor"
                class="text-xs text-warning"
              >
                Pertenece a «{{ t.ocupadoPor }}»: se moverá al guardar.
              </p>
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
      :clientes="cli.clientes.value"
      :telefonos="cli.telefonos.value"
      :importando="importando"
      :progreso="progreso"
      @importar="importarContactos"
    />

    <ClientesDialogoFusionarClientes
      v-model="dialogoFusionar"
      :clientes="cli.clientes.value"
      :telefonos="cli.telefonos.value"
      :preseleccion="[]"
      :loading="fusionando"
      @fusionar="fusionarClientes"
    />

    <ClientesDialogoMoverTelefono
      v-model="dialogoMover"
      :telefono="telefonoAMover"
      :clientes="cli.clientes.value"
      @mover="moverTelefono"
    />
  </BaseHeaderPage>
</template>
