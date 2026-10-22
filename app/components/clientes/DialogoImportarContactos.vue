<script setup>
/**
 * Vista previa de los contactos del dispositivo para crear clientes en lote.
 *
 * No crea nada por su cuenta: devuelve un PLAN ya resuelto y la página lo
 * aplica. El plan tiene un bloque por cliente final (varios contactos pueden
 * unirse en uno) con su destino y los números que le corresponden.
 *
 * Las tres decisiones que NO se toman solas:
 * 1. Dos contactos con nombres parecidos: ¿misma persona o distintas?
 * 2. Un contacto parecido a un cliente que ya existe: ¿añadir o crear otro?
 * 3. Un número que ya tiene dueño: ¿moverlo o dejarlo donde está?
 *
 * Los números ya asignados a otro cliente se muestran con su dueño actual; si
 * se acepta moverlos, la importación reasigna la fila (el historial viejo sigue
 * apuntando al número, no al cliente).
 *
 * Al confirmar el diálogo **no se cierra**: con ~150 contactos el proceso dura
 * varios segundos y se queda en modo progreso hasta el resumen.
 */
import { normalizarTelefono } from '../../utils/parseEtecsaSms'
import {
  nombrePareceTelefono,
  normalizarNombre,
  similitudNombres
} from '#shared/clientes'

const UMBRAL = 0.8

const abierta = defineModel({ type: Boolean, default: false })

const props = defineProps({
  contactos: { type: Array, default: () => [] },
  cargando: { type: Boolean, default: false },
  /** Clientes vivos del puesto (para avisar de nombres parecidos). */
  clientes: { type: Array, default: () => [] },
  /** Filas de `clientes_telefonos` (para saber de quién es cada número). */
  telefonos: { type: Array, default: () => [] },
  importando: { type: Boolean, default: false },
  /** { hechos, total, clientes, numeros, movidos, omitidos } */
  progreso: { type: Object, default: null }
})

const emit = defineEmits(['importar'])

const busqueda = ref('')
const seleccionados = ref([])
/** `id1|id2` → 'mismo' | 'distintos'. Sin decidir = la pregunta está pendiente. */
const decisiones = ref({})
/** contactoId → mover sus números ocupados. */
const mover = ref({})
/** primerContactoDelBloque → 'nuevo' | clienteId. */
const destinos = ref({})
/** primerContactoDelBloque → nombre final del cliente. */
const nombres = ref({})

watch(abierta, (v) => {
  if (!v) return
  busqueda.value = ''
  decisiones.value = {}
  mover.value = {}
  destinos.value = {}
  nombres.value = {}
  seleccionados.value = []
  inicializar()
})

// Los contactos llegan después de abrir el diálogo (permiso + lectura).
watch(() => props.contactos, () => {
  if (abierta.value) inicializar()
})

/** Arranca con todo lo importable marcado; el jefe destilda lo que no quiera. */
function inicializar() {
  seleccionados.value = items.value.filter(i => i.numeros.length).map(i => i.id)
}

const items = computed(() => props.contactos.map((c) => {
  const numeros = []
  const vistos = new Set()
  for (const raw of c.telefonos || []) {
    const telefono = normalizarTelefono(raw)
    if (!telefono || telefono.length !== 10 || vistos.has(telefono)) continue
    vistos.add(telefono)
    const fila = props.telefonos.find(t => t.telefono === telefono) ?? null
    const ocupado = !!fila && fila.activo !== false
    numeros.push({
      telefono,
      ocupado,
      dueno: ocupado ? (props.clientes.find(x => x.id === fila.clienteId) ?? null) : null
    })
  }
  return {
    id: c.id,
    nombre: String(c.nombre ?? '').trim(),
    numeros
  }
}))

const clientesCanonicos = computed(() =>
  props.clientes.map(cliente => ({ cliente, canon: normalizarNombre(cliente.nombre) }))
)

/**
 * Pares de contactos con nombres parecidos. Solo entre contactos importables y
 * con nombre útil: dos contactos llamados con un número no son un duplicado.
 */
const pares = computed(() => {
  const lista = items.value.filter(i => i.numeros.length && i.nombre && !nombrePareceTelefono(i.nombre))
  const salida = []
  for (let i = 0; i < lista.length; i++) {
    for (let j = i + 1; j < lista.length; j++) {
      const a = lista[i]
      const b = lista[j]
      const sim = similitudNombres(a.nombre, b.nombre)
      if (sim < UMBRAL) continue
      salida.push({
        clave: `${a.id}|${b.id}`,
        a: a.id,
        b: b.id,
        nombres: [a.nombre, b.nombre],
        similitud: sim
      })
    }
  }
  return salida.sort((x, y) => y.similitud - x.similitud)
})

function raiz(padre, id) {
  let actual = id
  while (padre.get(actual) !== actual) {
    padre.set(actual, padre.get(padre.get(actual)))
    actual = padre.get(actual)
  }
  return actual
}

/** Bloques de contactos que acabarán en el mismo cliente (union-find). */
const grupos = computed(() => {
  const padre = new Map(items.value.map(i => [i.id, i.id]))
  for (const p of pares.value) {
    if (decisiones.value[p.clave] !== 'mismo') continue
    const ra = raiz(padre, p.a)
    const rb = raiz(padre, p.b)
    if (ra !== rb) padre.set(rb, ra)
  }

  const bloques = new Map()
  for (const it of items.value) {
    const r = raiz(padre, it.id)
    if (!bloques.has(r)) bloques.set(r, [])
    bloques.get(r).push(it)
  }

  return [...bloques.values()].map(contactos => analizar(contactos))
})

/**
 * Para un bloque: ¿ya existe un cliente con ese nombre exacto? ¿hay clientes
 * parecidos que convenga preguntar? Se calcula con el nombre canónico, que es
 * la misma regla con la que la importación evita duplicados.
 */
function analizar(contactos) {
  const canon = new Set(contactos.map(c => normalizarNombre(c.nombre)).filter(Boolean))
  let existente = null
  const parecidos = []
  const vistos = new Set()

  for (const { cliente, canon: nombreCliente } of clientesCanonicos.value) {
    if (!nombreCliente || vistos.has(cliente.id)) continue
    if (canon.has(nombreCliente)) {
      vistos.add(cliente.id)
      existente ??= cliente
      continue
    }
    for (const c of contactos) {
      if (!c.nombre) continue
      // Atajo barato: solo comparar si comparten primera letra o un token.
      const ta = new Set(normalizarNombre(c.nombre).split(' '))
      const tb = new Set(nombreCliente.split(' '))
      const comparte = [...ta].some(t => t.length >= 3 && tb.has(t))
      if (!comparte && c.nombre[0].toLowerCase() !== cliente.nombre[0]?.toLowerCase()) continue
      if (similitudNombres(c.nombre, cliente.nombre) >= UMBRAL) {
        vistos.add(cliente.id)
        parecidos.push({ cliente, contacto: c })
        break
      }
    }
  }

  return { clave: contactos[0].id, contactos, existente, parecidos: parecidos.slice(0, 5) }
}

const seleccionadosSet = computed(() => new Set(seleccionados.value))

function alternar(id) {
  seleccionados.value = seleccionadosSet.value.has(id)
    ? seleccionados.value.filter(x => x !== id)
    : [...seleccionados.value, id]
}

function todosVisibles() {
  const ids = itemsVisibles.value.filter(i => i.numeros.length).map(i => i.id)
  const todos = ids.length > 0 && ids.every(id => seleccionadosSet.value.has(id))
  seleccionados.value = todos ? [] : [...new Set([...seleccionados.value, ...ids])]
}

const itemsVisibles = computed(() => {
  const q = busqueda.value.trim().toLowerCase()
  if (!q) return items.value
  return items.value.filter(i =>
    i.nombre.toLowerCase().includes(q) || i.numeros.some(n => n.telefono.includes(q))
  )
})

const visiblesSet = computed(() => new Set(itemsVisibles.value.map(i => i.id)))
const gruposVisibles = computed(() =>
  grupos.value.filter(g => g.contactos.some(c => visiblesSet.value.has(c.id)))
)

const importablesTotal = computed(() => items.value.filter(i => i.numeros.length).length)
const ocupadosTotal = computed(() =>
  items.value.reduce((s, i) => s + i.numeros.filter(n => n.ocupado).length, 0)
)

/** Pares que importan: los dos contactos se van a importar y no hay decisión. */
const paresPendientes = computed(() =>
  pares.value.filter(p =>
    seleccionadosSet.value.has(p.a) && seleccionadosSet.value.has(p.b) && !decisiones.value[p.clave]
  )
)

function decidir(clave, valor) {
  decisiones.value = { ...decisiones.value, [clave]: valor }
}

function nombreDe(grupo) {
  const clave = grupo.contactos[0]?.id
  if (nombres.value[clave] !== undefined) return nombres.value[clave]
  const util = grupo.contactos.map(c => c.nombre).find(n => n && !nombrePareceTelefono(n))
  return util ?? ''
}

function setNombre(grupo, valor) {
  const clave = grupo.contactos[0]?.id
  if (clave) nombres.value = { ...nombres.value, [clave]: valor }
}

function destinoDe(grupo) {
  const clave = grupo.contactos[0]?.id
  if (destinos.value[clave] !== undefined) return destinos.value[clave]
  return grupo.existente?.id ?? 'nuevo'
}

function setDestino(grupo, valor) {
  const clave = grupo.contactos[0]?.id
  if (clave) destinos.value = { ...destinos.value, [clave]: valor }
}

const clientesOrdenados = computed(() =>
  [...props.clientes].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
)

function opcionesDestino(grupo) {
  const marcados = new Set(grupo.parecidos.map(p => p.cliente.id))
  return [
    { label: 'Crear un cliente nuevo', value: 'nuevo' },
    ...clientesOrdenados.value.map(c => ({
      label: marcados.has(c.id) ? `${c.nombre} (parecido)` : c.nombre,
      value: c.id
    }))
  ]
}

/** Solo se pregunta el destino cuando no es obvio (hay fusión o un parecido). */
function destinoEditable(grupo) {
  return grupo.contactos.length > 1 || !!grupo.existente || grupo.parecidos.length > 0
}

/** El nombre solo se pide si el contacto no trae uno utilizable o hay que desambiguarlo. */
function nombreEditable(grupo) {
  // Si el destino es un cliente existente manda su nombre, no el del contacto.
  if (destinoDe(grupo) !== 'nuevo') return false
  return grupo.contactos.length > 1
    || !!grupo.parecidos.length
    || !nombreDe(grupo).trim()
    || grupo.contactos.some(c => nombrePareceTelefono(c.nombre))
}

function contactosSeleccionados(grupo) {
  return grupo.contactos.filter(c => seleccionadosSet.value.has(c.id))
}

function bloqueActivo(grupo) {
  return contactosSeleccionados(grupo).length > 0
}

/**
 * Números que realmente se van a importar en un bloque: los libres siempre,
 * los ocupados solo si el jefe marcó moverlos. Sirve para no pedir nombre ni
 * bloquear la importación por bloques que acabarían sin números.
 */
function numerosDelBloque(grupo) {
  const salida = new Set()
  for (const c of contactosSeleccionados(grupo)) {
    for (const n of c.numeros) {
      if (n.ocupado && !mover.value[c.id]) continue
      salida.add(n.telefono)
    }
  }
  return [...salida]
}

/** El bloque tiene un cliente parecido y el jefe todavía no dijo qué hacer. */
function destinoPendiente(grupo) {
  if (!bloqueActivo(grupo) || destinoDe(grupo) !== 'nuevo' || grupo.existente) return false
  // Solo se pregunta por un contacto suelto: si el jefe ya unió varios, el
  // nombre y el destino los está decidiendo a la vista.
  if (grupo.contactos.length !== 1) return false
  return grupo.parecidos.length > 0 && destinos.value[grupo.contactos[0].id] === undefined
}

/** Texto del destino ya resuelto (para no mentir cuando se añade a otro cliente). */
function textoDestino(grupo) {
  const destino = destinoDe(grupo)
  if (destino !== 'nuevo') {
    const cliente = props.clientes.find(c => c.id === destino)
    return `Se añadirá a «${cliente?.nombre ?? 'otro cliente'}»`
  }
  return `Se creará «${nombreDe(grupo)}»`
}

/** Solo bloquea el bloque que de verdad necesita nombre (destino = cliente nuevo). */
const bloquesSinNombre = computed(() =>
  grupos.value.filter(g =>
    numerosDelBloque(g).length && nombreEditable(g) && !nombreDe(g).trim()
  )
)

const puedeConfirmar = computed(() =>
  seleccionados.value.length > 0
  && paresPendientes.value.length === 0
  && !bloquesSinNombre.value.length
  && !grupos.value.some(g => destinoPendiente(g))
  && grupos.value.some(g => numerosDelBloque(g).length)
)

const porcentaje = computed(() => {
  const p = props.progreso
  if (!p?.total) return 0
  return Math.min(100, Math.round((p.hechos / p.total) * 100))
})

const hayResumen = computed(() => !props.importando && !!props.progreso?.total)

const titulo = computed(() => (hayResumen.value ? 'Importación terminada' : 'Importar contactos'))
const descripcion = computed(() => {
  if (hayResumen.value) return 'Revisa el resultado antes de cerrar.'
  return 'Elige los contactos que quieres convertir en clientes.'
})

const resumenBloqueos = computed(() => {
  const partes = []
  if (paresPendientes.value.length) partes.push(`${paresPendientes.value.length} nombre(s) parecido(s)`)
  if (bloquesSinNombre.value.length) partes.push(`${bloquesSinNombre.value.length} sin nombre`)
  const pendientes = grupos.value.filter(g => destinoPendiente(g)).length
  if (pendientes) partes.push(`${pendientes} destino(s) por decidir`)
  return partes.join(' · ')
})

/**
 * Convierte la vista en el plan que aplica la página.
 *
 * - Los contactos unidos aportan sus números al mismo cliente.
 * - `etiqueta` es el nombre del contacto cuando difiere del nombre final: es lo
 *   que luego permite leer "Cheila 2 · Cheila" en Recargas.
 * - Los números ocupados solo entran si el jefe marcó moverlos.
 */
function confirmar() {
  if (!puedeConfirmar.value) return
  const plan = []
  const yaIncluidos = new Set()

  for (const grupo of grupos.value) {
    const contactos = contactosSeleccionados(grupo)
    if (!contactos.length) continue
    const destino = destinoDe(grupo)

    const numeros = []
    for (const c of contactos) {
      const etiqueta = normalizarNombre(c.nombre) === normalizarNombre(nombreDe(grupo))
        || nombrePareceTelefono(c.nombre)
        ? null
        : c.nombre
      for (const n of c.numeros) {
        if (n.ocupado && !mover.value[c.id]) continue
        if (yaIncluidos.has(n.telefono)) continue
        yaIncluidos.add(n.telefono)
        numeros.push({ telefono: n.telefono, etiqueta })
      }
    }
    if (!numeros.length) continue

    const nombre = nombreDe(grupo).trim()
    if (!nombre) continue

    plan.push({
      clave: grupo.clave,
      nombre,
      clienteId: destino === 'nuevo' ? null : destino,
      numeros
    })
  }

  emit('importar', plan)
}
</script>

<template>
  <BaseDialog
    v-model="abierta"
    :title="titulo"
    :description="descripcion"
    :confirm-text="`Importar ${seleccionados.length || ''} contacto(s)`"
    :loading="importando"
    :hide-confirm="importando || hayResumen"
    :cancel-text="hayResumen ? 'Cerrar' : 'Cancelar'"
    :disabled-guardar="!puedeConfirmar"
    @confirm="confirmar"
    @cancel="abierta = false"
  >
    <!-- 1. Leyendo la agenda -->
    <div v-if="cargando" class="flex flex-col items-center gap-2 py-10">
      <UIcon name="i-lucide-loader-circle" class="size-7 animate-spin text-muted" />
      <p class="text-sm text-muted">
        Leyendo contactos del teléfono...
      </p>
    </div>

    <!-- 2. Importando -->
    <div v-else-if="importando" class="space-y-3">
      <div class="flex items-center justify-between text-sm">
        <span class="font-medium">Importando contactos...</span>
        <span class="font-mono text-xs text-muted">
          {{ progreso?.hechos ?? 0 }} / {{ progreso?.total ?? 0 }}
        </span>
      </div>
      <UProgress
        :model-value="porcentaje"
        size="sm"
      />
      <p class="text-xs text-muted">
        Se procesa por tandas para que la pantalla pueda pintarse. Deja la app
        abierta un momento.
      </p>
      <div class="grid grid-cols-4 gap-2 pt-1 text-center">
        <div class="rounded-md border border-default p-2">
          <p class="text-xs text-muted">
            Clientes
          </p>
          <p class="text-sm font-bold font-mono">
            {{ progreso?.clientes ?? 0 }}
          </p>
        </div>
        <div class="rounded-md border border-default p-2">
          <p class="text-xs text-muted">
            Números
          </p>
          <p class="text-sm font-bold font-mono">
            {{ progreso?.numeros ?? 0 }}
          </p>
        </div>
        <div class="rounded-md border border-default p-2">
          <p class="text-xs text-muted">
            Movidos
          </p>
          <p class="text-sm font-bold font-mono">
            {{ progreso?.movidos ?? 0 }}
          </p>
        </div>
        <div class="rounded-md border border-default p-2">
          <p class="text-xs text-muted">
            Omitidos
          </p>
          <p class="text-sm font-bold font-mono">
            {{ progreso?.omitidos ?? 0 }}
          </p>
        </div>
      </div>
    </div>

    <!-- 3. Resumen final -->
    <div v-else-if="hayResumen" class="space-y-3">
      <UAlert
        color="success"
        variant="soft"
        icon="i-lucide-circle-check"
        :title="`${progreso.clientes} cliente(s) nuevos`"
        :description="`${progreso.numeros} número(s) añadidos${progreso.movidos ? `, ${progreso.movidos} movidos de otro cliente` : ''}${progreso.omitidos ? `, ${progreso.omitidos} omitidos` : ''}.`"
      />
      <p class="text-xs text-muted">
        Los contactos con números ya asignados volverán a salir en la próxima
        importación hasta que decidas moverlos.
      </p>
    </div>

    <!-- 4. Vista previa -->
    <div v-else class="space-y-4">
      <UInput
        v-model="busqueda"
        icon="i-lucide-search"
        placeholder="Buscar por nombre o número"
        class="w-full"
      />

      <div class="flex items-center justify-between text-xs text-muted">
        <span>
          {{ importablesTotal }} con números
          <template v-if="ocupadosTotal">
            · {{ ocupadosTotal }} ya asignados
          </template>
        </span>
        <UButton
          v-if="itemsVisibles.length"
          size="xs"
          variant="ghost"
          color="neutral"
          label="Elegir / quitar todos"
          @click="todosVisibles"
        />
      </div>

      <UAlert
        v-if="!items.length"
        color="neutral"
        variant="soft"
        icon="i-lucide-user-x"
        title="Nada que importar"
        description="No hay contactos con números utilizables."
      />

      <!-- 4a. Nombres parecidos entre contactos -->
      <div
        v-if="pares.length"
        class="rounded-lg border border-warning/40 bg-warning/5 p-3"
      >
        <p class="flex items-center gap-1 text-sm font-medium">
          <UIcon name="i-lucide-copy" class="size-4" />
          Nombres parecidos
          <UBadge
            v-if="paresPendientes.length"
            size="sm"
            color="warning"
            variant="soft"
            :label="`${paresPendientes.length} sin decidir`"
          />
        </p>
        <p class="mt-1 text-xs text-muted">
          ¿Son la misma persona? Al unirlos, sus números quedan en un solo
          cliente y cada número conserva el nombre del contacto.
        </p>
        <div class="mt-2 max-h-48 space-y-2 overflow-y-auto pr-1">
          <div
            v-for="p in pares"
            :key="p.clave"
            class="rounded-md border border-default bg-default p-2"
          >
            <p class="text-sm">
              {{ p.nombres[0] }}
              <span class="text-muted">≈</span>
              {{ p.nombres[1] }}
              <span class="ml-1 text-xs text-muted">{{ Math.round(p.similitud * 100) }}%</span>
            </p>
            <div class="mt-1 flex flex-wrap gap-1">
              <UButton
                size="xs"
                label="Mismo cliente"
                :color="decisiones[p.clave] === 'mismo' ? 'primary' : 'neutral'"
                :variant="decisiones[p.clave] === 'mismo' ? 'solid' : 'outline'"
                @click="decidir(p.clave, 'mismo')"
              />
              <UButton
                size="xs"
                label="Son distintos"
                :color="decisiones[p.clave] === 'distintos' ? 'primary' : 'neutral'"
                :variant="decisiones[p.clave] === 'distintos' ? 'solid' : 'outline'"
                @click="decidir(p.clave, 'distintos')"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- 4b. Contactos -->
      <div
        v-if="items.length"
        class="max-h-96 divide-y divide-default overflow-y-auto rounded-lg border border-default"
      >
        <div
          v-for="g in gruposVisibles"
          :key="g.clave"
          class="space-y-2 p-3"
        >
          <UAlert
            v-if="g.contactos.length > 1"
            color="primary"
            variant="soft"
            icon="i-lucide-merge"
            :title="`Estos ${g.contactos.length} contactos serán un solo cliente`"
          />

          <div
            v-for="c in g.contactos"
            :key="c.id"
            class="flex items-start gap-2"
          >
            <UCheckbox
              :model-value="seleccionadosSet.has(c.id)"
              class="mt-1"
              @update:model-value="alternar(c.id)"
            />
            <div class="min-w-0 flex-1 space-y-1">
              <p class="truncate text-sm font-medium">
                {{ c.nombre || 'Sin nombre' }}
                <UBadge
                  v-if="nombrePareceTelefono(c.nombre)"
                  size="sm"
                  color="warning"
                  variant="soft"
                  label="nombre = número"
                  class="ml-1"
                />
              </p>

              <div class="flex flex-wrap gap-1">
                <UBadge
                  v-for="n in c.numeros"
                  :key="n.telefono"
                  size="sm"
                  :color="n.ocupado ? 'warning' : 'primary'"
                  :variant="n.ocupado ? 'outline' : 'soft'"
                  class="font-mono"
                  :label="n.ocupado
                    ? `${n.telefono} · ${n.dueno?.nombre ?? 'otro cliente'}`
                    : n.telefono"
                />
                <span
                  v-if="!c.numeros.length"
                  class="text-xs text-muted"
                >
                  sin números válidos
                </span>
              </div>

              <label
                v-if="c.numeros.some(n => n.ocupado)"
                class="flex items-center gap-2 text-xs text-muted"
              >
                <UCheckbox v-model="mover[c.id]" />
                <span>Mover los números que ya tienen dueño a este cliente</span>
              </label>

              <UAlert
                v-if="g.contactos.length === 1 && g.existente"
                color="neutral"
                variant="soft"
                icon="i-lucide-user-check"
                :title="`Se añadirá a «${g.existente.nombre}»`"
                class="mt-1"
              />
              <UAlert
                v-else-if="g.contactos.length === 1 && g.parecidos.length"
                color="warning"
                variant="soft"
                icon="i-lucide-users"
                :title="`Hay un cliente parecido: «${g.parecidos[0].cliente.nombre}»`"
                :description="destinoPendiente(g)
                  ? '¿Es la misma persona o hay que crear un cliente nuevo?'
                  : 'Puedes cambiarlo en el destino de abajo.'"
                class="mt-1"
              >
                <template v-if="destinoPendiente(g)" #actions>
                  <UButton
                    size="xs"
                    :label="`Es «${g.parecidos[0].cliente.nombre}»`"
                    @click="setDestino(g, g.parecidos[0].cliente.id)"
                  />
                  <UButton
                    size="xs"
                    variant="outline"
                    label="Es otro cliente"
                    @click="setDestino(g, 'nuevo')"
                  />
                </template>
              </UAlert>
            </div>
          </div>

          <!-- Nombre y destino del bloque (solo si se importa) -->
          <div
            v-if="bloqueActivo(g)"
            class="grid gap-2 pl-7 sm:grid-cols-2"
          >
            <UFormField
              v-if="nombreEditable(g)"
              label="Cliente final"
              :error="!nombreDe(g).trim() ? 'Escribe un nombre' : undefined"
            >
              <UInput
                :model-value="nombreDe(g)"
                placeholder="Nombre del cliente"
                class="w-full"
                @update:model-value="v => setNombre(g, v)"
              />
            </UFormField>
            <p
              v-else
              class="self-end pb-2 text-xs text-muted"
            >
              {{ textoDestino(g) }}
            </p>

            <UFormField
              v-if="destinoEditable(g)"
              label="Destino"
            >
              <USelectMenu
                :model-value="destinoDe(g)"
                :items="opcionesDestino(g)"
                value-key="value"
                label-key="label"
                class="w-full"
                @update:model-value="v => setDestino(g, v)"
              />
            </UFormField>
          </div>
        </div>
      </div>

      <UAlert
        v-if="resumenBloqueos"
        color="warning"
        variant="soft"
        icon="i-lucide-circle-help"
        title="Falta decidir"
        :description="resumenBloqueos"
      />
    </div>
  </BaseDialog>
</template>
