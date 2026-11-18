<script setup>
import { computed, ref } from 'vue'
import { interpretar } from '#shared/voz/gramatica'
import { GRUPOS_AYUDA, gruposDisponibles } from '#shared/voz/ayuda'
import { VOZ_WAKE_DEFECTO } from '#shared/voz/config'
import { useAuth } from '../../composables/useAuth'
import { useVozLexico } from '../../composables/useVozLexico'
import { useVozConfig } from '../../composables/useVozConfig'

/**
 * «¿Qué puedo decir?» - la ayuda de verdad.
 *
 * Misma fuente que la voz (`shared/voz/ayuda.js`): lo que se lee aquí es lo que
 * la asistente entiende. No es una lista de comandos: son tareas, con la frase
 * que hay que decir y un probador para comprobar que se entiende sin escribir
 * nada en la base.
 */
const auth = useAuth()
const vozLexico = useVozLexico()
const vozConfig = useVozConfig()

const ICONOS = {
  vender: 'i-lucide-receipt',
  fiar: 'i-lucide-hand-coins',
  cobrar: 'i-lucide-banknote',
  consultar: 'i-lucide-search',
  preparar: 'i-lucide-clipboard-list',
  cuadre: 'i-lucide-clipboard-check',
  sistema: 'i-lucide-info'
}

const ETIQUETAS = {
  venta_directa: 'Venta',
  venta_fiada: 'Fiado',
  cobro_deuda: 'Cobro',
  deuda_dinero: 'Deuda de dinero',
  transferencia_cuadre: 'Transferencia',
  consulta_stock: 'Consulta de stock',
  consulta_precio: 'Consulta de precio',
  consulta_deuda: 'Consulta de deudas',
  consulta_dia: 'Resumen del día',
  consulta_ganancia: 'Ganancia del día',
  consulta_caja: 'Caja',
  entrada_inventario: 'Entrada de inventario',
  cambio_precio: 'Cambio de precio',
  cuadre_accion: 'Abrir o cerrar cuadre',
  traspaso: 'Traspaso',
  ajuste_inventario: 'Merma o devolución',
  cliente_alta: 'Alta de cliente',
  producto_alta: 'Alta de producto',
  mover_producto: 'Mover producto',
  repetir: 'Repetir',
  ayuda: 'Ayuda',
  desconocido: 'Todavía no lo entiendo'
}

const despertador = computed(() => vozConfig.config.value.wake || VOZ_WAKE_DEFECTO)
const esTrabajador = computed(() => auth.esTrabajador.value)

const soloPermitidos = ref(true)
const busqueda = ref('')
const probador = ref(null)
// Frase del probador: la comparten el campo y los botones «Probar» de las tarjetas.
const prueba = ref('')

function normalizar(texto) {
  return String(texto ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

const base = computed(() => {
  if (esTrabajador.value || soloPermitidos.value) {
    return gruposDisponibles({ esTrabajador: esTrabajador.value })
  }
  return GRUPOS_AYUDA
})

const grupos = computed(() => {
  const q = normalizar(busqueda.value).trim()
  if (!q) return base.value
  return base.value.filter((grupo) => {
    const texto = normalizar([
      grupo.menu,
      grupo.sustantivo,
      grupo.detalle,
      grupo.extra,
      ...(grupo.ejemplos ?? []),
      ...grupo.palabras
    ].join(' '))
    return texto.includes(q)
  })
})

function tituloDe(grupo) {
  const texto = String(grupo.menu ?? '')
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

function detalleDe(grupo) {
  return String(grupo.detalle).replace('{ejemplo}', grupo.ejemplo)
}

function probar(frase) {
  busqueda.value = ''
  prueba.value = frase
  probador.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

// --------------------------- Probador de frases ---------------------------
const resultado = computed(() => {
  const texto = prueba.value.trim()
  if (!texto) return null
  return interpretar(texto, vozLexico.lexico.value)
})

function con(...partes) {
  return partes.filter(Boolean).join(' · ')
}

function resumenDe({ comando, slots }) {
  const s = slots ?? {}
  const producto = s.productoHint ? `«${s.productoHint}»` : 'producto sin decir'
  const cliente = s.clienteHint ? ` a ${s.clienteHint}` : ''
  const cantidad = s.cantidad ?? 1
  switch (comando) {
    case 'venta_directa':
      return con(
        `${cantidad} × ${producto}`,
        s.ubicacion ? `del ${s.ubicacion}` : null,
        s.tipoVenta && s.tipoVenta !== 'directa' ? `venta ${s.tipoVenta}` : null,
        s.precioUnitario != null ? `a ${s.precioUnitario}` : null
      )
    case 'venta_fiada':
      return con(`${cantidad} × ${producto}`, `fiado${cliente}`, s.ubicacion ? `del ${s.ubicacion}` : null)
    case 'cobro_deuda':
      return `${s.monto === 'todo' ? 'cobrar toda la deuda' : `cobrar ${s.monto}`}${s.clienteHint ? ` a ${s.clienteHint}` : ' sin cliente'}`
    case 'deuda_dinero':
      return con('anotar deuda', s.monto != null ? `de ${s.monto}` : 'sin monto', cliente.trim())
    case 'transferencia_cuadre':
      return con('transferencia', s.monto != null ? `de ${s.monto}` : 'sin monto', cliente.trim())
    case 'consulta_stock':
      return con('stock de', producto, s.ubicacion ? `en ${s.ubicacion}` : null)
    case 'consulta_precio':
      return con('precio de', producto)
    case 'consulta_deuda':
      return s.clienteHint ? `deuda de ${s.clienteHint}` : 'todas las deudas'
    case 'consulta_dia':
      return s.fecha ? `resumen del ${s.fecha}` : 'resumen de hoy'
    case 'entrada_inventario':
      return con('entrada de', `${cantidad} × ${producto}`, s.precioUnitario != null ? `a ${s.precioUnitario}` : null)
    case 'cambio_precio':
      return con('cambiar precio de', producto, s.precio != null ? `a ${s.precio}` : 'sin precio dicho')
    case 'traspaso':
      return con('traspaso de', `${cantidad} × ${producto}`, `al ${s.destino}`)
    case 'ajuste_inventario':
      return con(s.tipo === 'devolucion' ? 'devolución' : 'merma', `${cantidad} × ${producto}`)
    case 'producto_alta':
      return con('producto nuevo', s.nombre ? `«${s.nombre}»` : 'sin nombre', s.precio != null ? `a ${s.precio}` : null)
    case 'cliente_alta':
      return con('cliente nuevo', s.nombre ? `«${s.nombre}»` : 'sin nombre')
    case 'mover_producto':
      return con('mover', producto, s.referenciaHint ? `${s.posicion} de «${s.referenciaHint}»` : `al ${s.posicion}`)
    case 'cuadre_accion':
      return s.accion === 'cerrar' ? 'cerrar el cuadre' : 'abrir el cuadre'
    case 'repetir':
      return 'repetir la última respuesta'
    case 'ayuda':
      return s.tema ? `ayuda de ${s.tema}` : 'menú de ayuda'
    default:
      return ''
  }
}

const pruebaOk = computed(() => resultado.value && resultado.value.comando !== 'desconocido')
</script>

<template>
  <div class="space-y-6">
    <BaseHeaderPage
      title="¿Qué puedo decir?"
      description="Los comandos de voz, explicados como tareas. Esta es la misma lista que entiende la asistente."
      leading-icon="i-lucide-mic"
      :show-button="false"
    />

    <!-- Cómo se usa: el modelo, no la lista. -->
    <UCard>
      <div class="space-y-3">
        <h2 class="text-sm font-semibold">
          Cómo se usa
        </h2>
        <ol class="space-y-2 text-sm text-muted">
          <li class="flex gap-2">
            <span class="font-semibold text-default">1.</span>
            <span>
              Di la palabra clave y lo que quieres:
              <span class="font-medium text-default">«{{ despertador }}, vende dos panes»</span>.
              También vale tocar el micrófono.
            </span>
          </li>
          <li class="flex gap-2">
            <span class="font-semibold text-default">2.</span>
            <span>
              Antes de anotar, la asistente dice lo que entendió y espera un
              <span class="font-medium text-default">«sí»</span>.
              Nada se registra solo.
            </span>
          </li>
          <li class="flex gap-2">
            <span class="font-semibold text-default">3.</span>
            <span>
              Si se equivocó, di <span class="font-medium text-default">«no»</span>;
              si no lo oíste, <span class="font-medium text-default">«repite»</span>.
              Y <span class="font-medium text-default">«ayuda»</span> abre este menú por voz.
            </span>
          </li>
        </ol>
        <p class="text-xs text-muted">
          Con la app cerrada funciona vender, fiar, cobrar y consultar. Las entradas y los
          cambios de precio necesitan la app abierta.
        </p>
      </div>
    </UCard>

    <!-- Probador: comprobar que una frase se entiende sin tocar datos. -->
    <div ref="probador">
      <UCard>
        <div class="space-y-3">
          <div>
            <h2 class="text-sm font-semibold">
              Prueba una frase
            </h2>
            <p class="text-sm text-muted">
              Escribe lo que dirías y te digo qué entiendo. No anota nada.
            </p>
          </div>
          <UInput
            v-model="prueba"
            icon="i-lucide-keyboard"
            placeholder="por ejemplo: cobra 200 a Juan"
            class="w-full"
            autocomplete="off"
          />
          <UAlert
            v-if="resultado"
            :color="pruebaOk ? 'success' : 'warning'"
            variant="soft"
            :icon="pruebaOk ? 'i-lucide-check-circle' : 'i-lucide-help-circle'"
            :title="ETIQUETAS[resultado.comando] ?? resultado.comando"
            :description="pruebaOk
              ? resumenDe(resultado)
              : 'No lo entiendo todavía. Di «ayuda» y dime qué quieres hacer, o revisa las tarjetas de abajo.'"
          />
        </div>
      </UCard>
    </div>

    <!-- Filtros -->
    <div class="flex flex-wrap items-center gap-3">
      <USwitch
        v-model="soloPermitidos"
        color="neutral"
        :disabled="esTrabajador"
        :description="esTrabajador
          ? 'En el cuadre solo puedes fiar, anotar deudas y registrar transferencias.'
          : 'Oculta lo que este equipo no puede hacer.'"
      >
        Solo lo que puedo hacer ahora
      </USwitch>
      <UInput
        v-model="busqueda"
        icon="i-lucide-search"
        placeholder="Buscar: cobrar, stock, traspaso…"
        class="w-full sm:w-72"
        autocomplete="off"
      />
    </div>

    <!-- Tareas -->
    <div class="grid gap-4 sm:grid-cols-2">
      <UCard v-for="grupo in grupos" :key="grupo.id">
        <div class="space-y-3">
          <div class="flex items-center gap-2">
            <UIcon :name="ICONOS[grupo.id] ?? 'i-lucide-mic'" class="size-5 text-primary" />
            <h2 class="font-semibold">
              {{ tituloDe(grupo) }}
            </h2>
          </div>
          <p class="text-sm">
            {{ detalleDe(grupo) }}
          </p>
          <p class="text-xs text-muted">
            {{ grupo.extra }}
          </p>
          <div class="flex flex-wrap gap-2">
            <UButton
              v-for="frase in grupo.ejemplos"
              :key="frase"
              size="xs"
              variant="soft"
              color="neutral"
              icon="i-lucide-play"
              :label="frase"
              @click="probar(frase)"
            />
          </div>
        </div>
      </UCard>
    </div>

    <UAlert
      v-if="!grupos.length"
      color="neutral"
      variant="soft"
      icon="i-lucide-search-x"
      title="Nada coincide con la búsqueda"
      description="Prueba con otra palabra: vender, fiar, cobrar, stock, precio, deuda, traspaso, cliente."
    />

    <!-- Lo que no hace: tan importante como lo que sí. -->
    <UCard>
      <div class="space-y-2">
        <h2 class="text-sm font-semibold">
          Lo que no hace
        </h2>
        <ul class="list-inside list-disc space-y-1 text-sm text-muted">
          <li>No anota nada sin tu «sí»: primero te lee lo que entendió.</li>
          <li>No vende si no hay stock, ni cobra más de lo que se debe.</li>
          <li>No inventa un producto, un cliente ni un precio que no haya oído.</li>
          <li>Con la app cerrada no prepara formularios ni cambia precios.</li>
          <li>Si hay dos productos o clientes parecidos, pregunta cuál antes de seguir.</li>
        </ul>
      </div>
    </UCard>
  </div>
</template>
