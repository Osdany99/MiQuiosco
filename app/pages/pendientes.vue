<script setup>
/**
 * /pendientes — Revisión de lo dictado por voz.
 *
 * La voz nunca registra sola: cada comando que mueve inventario queda aquí
 * esperando que el jefe lo confirme. Las consultas no aparecen: se responden al
 * momento, incluso con la app cerrada.
 *
 * La venta conserva la fecha del dictado (`dictadoEn`), no la de confirmación:
 * si el jefe revisa al final del día, la venta sigue perteneciendo al día en
 * que se dijo. Nada caduca por tiempo salvo el tope de seguridad de 7 días, que
 * archiva la acción para que no se aplique a ciegas.
 */
import { etiquetaAntiguedad, estaCaducada, puedeAplicar } from '../utils/voice/pendientes'

definePageMeta({
  middleware: ['jefe']
})

const toast = useToast()
const auth = useAuth()
const inv = useInventario()
const acciones = useAccionesPendientes()
const snapshot = useVozSnapshot()
const servicio = useVozServicio()
const fiado = useCuentasFiado()

/** Nombres de los clientes: la acción guarda el id, no el nombre. */
const clientes = ref([])

const mostrarArchivadas = ref(false)
const listo = ref(false)
const aplicandoId = ref(null)
const descartando = ref(null)
const dialogoDescartar = ref(false)
const descartandoEnCurso = ref(false)

const editando = ref(null)
const dialogoEditar = ref(false)

// Asignar producto: un dictado que el STT no supo nombrar no debe perderse.
const asignando = ref(null)
const dialogoAsignar = ref(false)
const productoAsignado = ref(null)
const catalogoAsignar = ref([])
const cargandoCatalogo = ref(false)
const asignandoEnCurso = ref(false)

const pendientes = computed(() =>
  [...acciones.pendientes.value].sort((a, b) => Number(a.dictadoEn) - Number(b.dictadoEn))
)

const revisadas = computed(() =>
  [...acciones.revisadas.value]
    .sort((a, b) => Number(b.aplicadaEn ?? b.dictadoEn) - Number(a.aplicadaEn ?? a.dictadoEn))
    .slice(0, 30)
)

const resumen = computed(() => acciones.totales.value)

const ubicacionDe = accion => (accion?.ubicacion === 'almacen' ? 'Almacén' : 'Quiosco')
const iconoUbicacion = accion => (accion?.ubicacion === 'almacen' ? 'i-lucide-warehouse' : 'i-lucide-store')

const MODOS = {
  directa: 'venta',
  casa: 'casa',
  familiar: 'familiar',
  regalo: 'regalo'
}

const etiquetaTipo = (accion) => {
  if (accion?.tipo === 'deuda') return 'Fiado'
  if (accion?.tipo === 'cobro') return 'Cobro'
  switch (accion?.tipoVenta) {
    case 'casa': return 'Venta casa'
    case 'familiar': return 'Venta familiar'
    case 'regalo': return 'Regalo'
    default: return 'Venta directa'
  }
}

const esDeuda = accion => accion?.tipo === 'deuda'
const esCobro = accion => accion?.tipo === 'cobro'

/** Nombre del cliente de un fiado dictado. */
const clientesPorId = computed(() => new Map(clientes.value.map(c => [c.id, c.nombre])))
function nombreCliente(accion) {
  if (!accion?.clienteId) return 'Cliente sin identificar'
  return clientesPorId.value.get(accion.clienteId) || 'Cliente'
}

function fechaCompleta(ms) {
  if (!ms) return '—'
  try {
    return new Date(Number(ms)).toLocaleString('es-MX')
  } catch {
    return String(ms)
  }
}

function nombreProducto(accion) {
  if (accion?.tipo === 'cobro') return 'Cobro de deuda'
  return accion?.productoNombre || 'Producto sin identificar'
}

function sinProducto(accion) {
  return !accion?.productoId && accion?.tipo !== 'cobro'
}

function estaVencida(accion) {
  return estaCaducada(accion?.dictadoEn)
}

function puedeRegistrar(accion) {
  return puedeAplicar(accion) && !estaVencida(accion)
}

/** Toast común + refresco del stock y del snapshot que lee el servicio. */
async function trasCambio(mensaje) {
  if (mensaje) toast.add({ title: mensaje, color: 'success' })
  // Aplicar cambia el stock: recargar saldos también invalida la caché de
  // catálogo de la voz (versionSaldos), para que no siga ofreciendo lo vendido.
  await inv.cargarSaldos().catch(() => {})
  await snapshot.actualizar().catch(() => {})
}

async function recargar() {
  await acciones.cargar({ forzar: true }).catch((e) => {
    toast.add({ title: 'No se pudo cargar la cola', description: e?.message, color: 'error' })
  })
  listo.value = true
}

async function registrar(accion) {
  if (!puedeRegistrar(accion) || aplicandoId.value) return
  aplicandoId.value = accion.id
  try {
    await acciones.aplicar(accion)
    await trasCambio(`Registrada: ${nombreProducto(accion)}`)
  } catch (e) {
    // El stock pudo cambiar desde el dictado: la acción sigue pendiente para
    // editarla o descartarla, sin inventar una venta.
    toast.add({
      title: 'No se pudo registrar',
      description: e?.message ?? 'Revisa el stock y vuelve a intentarlo.',
      color: 'error'
    })
    await acciones.cargar({ forzar: true }).catch(() => {})
  } finally {
    aplicandoId.value = null
  }
}

function abrirEditar(accion) {
  editando.value = accion
  dialogoEditar.value = true
}

const productoEdicion = computed(() => {
  const accion = editando.value
  if (!accion) return null
  return {
    productoId: accion.productoId,
    nombre: accion.productoNombre ?? 'Producto',
    precioVentaActual: Number(accion.precioUnitario) || 0,
    stock: 0
  }
})

const prefillEdicion = computed(() => {
  const accion = editando.value
  if (!accion) return null
  return {
    modo: MODOS[accion.tipoVenta] ?? 'venta',
    cantidad: Number(accion.cantidad) || 1,
    precioVentaUsado: Number(accion.precioUnitario) || 0
  }
})

/** El diálogo ya creó la venta: solo hay que cerrar la acción y enlazarla. */
async function onGuardadoEdicion(venta) {
  const accion = editando.value
  dialogoEditar.value = false
  editando.value = null
  if (!accion) return
  try {
    await acciones.marcarAplicada(accion, venta?.id ?? null)
    await trasCambio(`Registrada: ${nombreProducto(accion)}`)
  } catch (e) {
    toast.add({
      title: 'La venta se registró, pero la acción sigue pendiente',
      description: e?.message,
      color: 'warning'
    })
    await acciones.cargar({ forzar: true }).catch(() => {})
  }
}

function pedirDescarte(accion) {
  descartando.value = accion
  dialogoDescartar.value = true
}

/**
 * Dictado sin producto: se elige del catálogo de la ubicación destino. El
 * nombre se guarda tal cual para que la fila y el historial sean legibles.
 */
async function abrirAsignar(accion) {
  asignando.value = accion
  productoAsignado.value = accion?.productoId ?? null
  dialogoAsignar.value = true
  if (catalogoAsignar.value.length || cargandoCatalogo.value) return
  cargandoCatalogo.value = true
  try {
    catalogoAsignar.value = (await inv.cargarSaldos()) ?? []
  } catch (e) {
    toast.add({ title: 'No se pudo cargar el catálogo', description: e?.message, color: 'error' })
  } finally {
    cargandoCatalogo.value = false
  }
}

const opcionesAsignar = computed(() => {
  const ubicacion = asignando.value?.ubicacion === 'almacen' ? 'almacen' : 'quiosco'
  return (catalogoAsignar.value ?? [])
    .map((fila) => {
      const id = fila?.productoId ?? fila?.id
      const nombre = String(fila?.nombre ?? '')
      if (!id || !nombre) return null
      const stock = Number(fila?.[ubicacion]) || 0
      return {
        id,
        nombre,
        precio: Number(fila?.precioVentaActual) || 0,
        stock,
        label: `${nombre} · ${stock} en ${ubicacion === 'almacen' ? 'almacén' : 'quiosco'}`
      }
    })
    .filter(Boolean)
})

async function confirmarAsignar() {
  const accion = asignando.value
  const opcion = opcionesAsignar.value.find(o => o.id === productoAsignado.value)
  if (!accion || !opcion || asignandoEnCurso.value) return
  asignandoEnCurso.value = true
  try {
    // El precio mandado por voz manda; sin precio dictado, el del catálogo.
    const precio = Number(accion.precioUnitario) > 0 ? Number(accion.precioUnitario) : opcion.precio
    await acciones.actualizar(accion, {
      productoId: opcion.id,
      productoNombre: opcion.nombre,
      precioUnitario: precio
    })
    dialogoAsignar.value = false
    asignando.value = null
    productoAsignado.value = null
    await trasCambio('Producto asignado')
  } catch (e) {
    toast.add({ title: 'No se pudo asignar', description: e?.message, color: 'error' })
  } finally {
    asignandoEnCurso.value = false
  }
}

async function confirmarDescarte() {
  const accion = descartando.value
  if (!accion) return
  descartandoEnCurso.value = true
  try {
    await acciones.archivar(accion, 'descartada')
    dialogoDescartar.value = false
    descartando.value = null
    await trasCambio('Acción descartada')
  } catch (e) {
    toast.add({ title: 'No se pudo descartar', description: e?.message, color: 'error' })
  } finally {
    descartandoEnCurso.value = false
  }
}

function motivoRevision(accion) {
  if (accion?.estado === 'aplicada') return 'Registrada'
  if (accion?.motivo === 'caducada') return 'Caducada'
  if (accion?.motivo === 'descartada') return 'Descartada'
  return accion?.motivo || 'Archivada'
}

// La cola se carga cuando ya hay puesto: antes de eso no hay nada que leer.
const pid = computed(() => auth.usuarioActual.value?.puestoId ?? null)
watch(pid, (valor) => {
  if (valor) recargar()
}, { immediate: true })

onMounted(() => {
  void servicio.refrescar()
  const puesto = auth.usuarioActual.value?.puestoId
  if (puesto) {
    void fiado.cargarClientes(puesto, { incluirSinCliente: false, incluirInactivos: true })
      .then((lista) => { clientes.value = lista ?? [] })
      .catch(() => {})
  }
})
</script>

<template>
  <BaseHeaderPage
    title="Por revisar (voz)"
    description="Lo dictado por voz espera tu confirmación; todavía no se registró nada"
    leading-icon="i-lucide-mic-vocal"
    :show-button="false"
  >
    <template #trailing>
      <UButton
        icon="i-lucide-refresh-cw"
        variant="outline"
        label="Actualizar"
        :loading="acciones.cargando.value"
        @click="recargar"
      />
    </template>

    <div class="grid grid-cols-3 gap-3 mb-4">
      <UCard>
        <p class="text-xs text-muted">
          Por revisar
        </p>
        <p class="text-xl font-bold font-mono">
          {{ resumen.cantidad }}
        </p>
      </UCard>
      <UCard>
        <p class="text-xs text-muted">
          Importe dictado
        </p>
        <p class="text-xl font-bold font-mono">
          {{ fmtPrecio(resumen.importe) }}
        </p>
      </UCard>
      <UCard>
        <p class="text-xs text-muted">
          Caducadas
        </p>
        <p class="text-xl font-bold font-mono" :class="resumen.caducadas ? 'text-error' : ''">
          {{ resumen.caducadas }}
        </p>
      </UCard>
    </div>

    <!-- Escucha con la app cerrada. Solo existe en Android: en web el
         micrófono es del navegador y no hay servicio que sobreviva. -->
    <UCard v-if="servicio.esNativo" class="mb-4">
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <p class="font-medium">
            Escuchar con la app cerrada
          </p>
          <p class="text-xs text-muted mt-1">
            Di «oye nova» y luego la venta. Se anota aquí; nada se
            registra solo. Con la app abierta el micrófono es del dock.
          </p>
          <p class="text-xs text-muted mt-1">
            Con la app cerrada, la notificación muestra lo que va entendiendo y
            un vúmetro. Si activás la onda en Ajustes, además aparece sobre la
            pantalla de bloqueo.
          </p>
          <p v-if="servicio.error.value" class="text-xs text-error mt-1">
            {{ servicio.error.value }}
          </p>
          <p v-else-if="servicio.preferencia.value && servicio.pausado.value" class="text-xs text-muted mt-1">
            En pausa mientras la app está abierta.
          </p>
          <p v-else-if="servicio.preferencia.value && servicio.motorActual.value" class="text-xs text-muted mt-1">
            Escuchando con el motor {{ servicio.motorActual.value === 'vosk' ? 'offline (Vosk)' : 'del sistema' }}.
          </p>
          <p
            v-if="servicio.faltaPermisoNotificaciones.value"
            class="text-xs text-warning mt-1"
          >
            Falta el permiso de notificaciones: no verás el aviso para abrir la
            revisión ni detener la escucha.
          </p>
          <p
            v-if="servicio.faltaExencionBateria.value"
            class="text-xs text-warning mt-1"
          >
            El teléfono puede apagar la escucha al bloquearlo.
            <UButton
              size="xs"
              variant="link"
              class="px-0"
              label="Permitir en segundo plano"
              @click="servicio.pedirExencionBateria"
            />
          </p>
          <p
            v-if="servicio.faltaPantallaCompleta.value"
            class="text-xs text-warning mt-1"
          >
            La onda no puede abrirse sobre el bloqueo.
            <UButton
              size="xs"
              variant="link"
              class="px-0"
              label="Permitir pantalla completa"
              @click="servicio.pedirPantallaCompleta"
            />
          </p>
        </div>
        <USwitch
          :model-value="servicio.preferencia.value"
          :loading="servicio.cambiando.value"
          @update:model-value="servicio.activar"
        />
      </div>
    </UCard>

    <UAlert
      v-if="listo && !pendientes.length"
      color="neutral"
      variant="soft"
      icon="i-lucide-inbox"
      title="No hay acciones por revisar"
      description="Cuando dictes una venta por voz, aparecerá aquí con lo que se entendió y el importe. Las consultas de stock no pasan por esta pantalla."
      class="mb-4"
    />

    <UCard v-else-if="pendientes.length">
      <ul class="divide-y divide-default">
        <li
          v-for="accion in pendientes"
          :key="accion.id"
          class="py-3"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-medium truncate">
                  {{ nombreProducto(accion) }}
                </span>
                <UBadge
                  variant="soft"
                  size="sm"
                  color="neutral"
                  :label="etiquetaTipo(accion)"
                />
                <UBadge
                  variant="soft"
                  size="sm"
                  color="neutral"
                  :icon="iconoUbicacion(accion)"
                  :label="ubicacionDe(accion)"
                />
                <UBadge
                  v-if="accion.origen === 'servicio'"
                  variant="outline"
                  size="sm"
                  color="info"
                  icon="i-lucide-radio"
                  label="Capturada con la app cerrada"
                />
                <UBadge
                  v-if="estaVencida(accion)"
                  variant="soft"
                  size="sm"
                  color="error"
                  label="Caducada"
                />
                <UBadge
                  v-else-if="sinProducto(accion)"
                  variant="soft"
                  size="sm"
                  color="warning"
                  label="Falta el producto"
                />
                <UBadge
                  v-else-if="accion.motivo === 'interpretacion_dudosa'"
                  variant="soft"
                  size="sm"
                  color="warning"
                  label="Interpretación dudosa"
                />
                <UBadge
                  v-else-if="accion.motivo === 'stock_insuficiente'"
                  variant="soft"
                  size="sm"
                  color="warning"
                  label="Sin stock al dictar"
                />
              </div>

              <p class="text-sm mt-1">
                <template v-if="esCobro(accion)">
                  <span class="text-xs text-muted">Cobro a {{ nombreCliente(accion) }} · </span>
                  <span class="font-mono font-medium">{{ fmtPrecio(accion.importe) }}</span>
                  <span class="text-xs text-muted"> ({{ accion.formaPago === 'transferencia' ? 'transferencia' : 'efectivo' }})</span>
                </template>
                <template v-else>
                  <span v-if="esDeuda(accion)" class="text-xs text-muted">Fiar a {{ nombreCliente(accion) }} · </span>
                  {{ Number(accion.cantidad) }} × {{ fmtPrecio(accion.precioUnitario) }}
                  = <span class="font-mono font-medium">{{ fmtPrecio(accion.importe) }}</span>
                </template>
              </p>

              <p class="text-xs text-muted mt-1">
                Dictada por {{ accion.usuarioNombre || 'el jefe' }} ·
                {{ etiquetaAntiguedad(accion.dictadoEn) }} ·
                {{ fechaCompleta(accion.dictadoEn) }}
              </p>

              <p
                v-if="accion.texto"
                class="text-xs text-muted mt-1 italic truncate"
                :title="accion.texto"
              >
                “{{ accion.texto }}”
              </p>
            </div>

            <div class="flex flex-col gap-1 shrink-0 items-end">
              <UButton
                v-if="sinProducto(accion)"
                size="xs"
                variant="soft"
                color="warning"
                icon="i-lucide-search"
                label="Asignar producto"
                :disabled="Boolean(aplicandoId)"
                @click="abrirAsignar(accion)"
              />
              <UButton
                size="xs"
                icon="i-lucide-check"
                label="Registrar"
                :loading="aplicandoId === accion.id"
                :disabled="!puedeRegistrar(accion) || Boolean(aplicandoId)"
                @click="registrar(accion)"
              />
              <UButton
                v-if="!esDeuda(accion) && !esCobro(accion)"
                size="xs"
                variant="soft"
                color="neutral"
                icon="i-lucide-pencil"
                label="Editar"
                :disabled="!accion.productoId || Boolean(aplicandoId)"
                @click="abrirEditar(accion)"
              />
              <UButton
                size="xs"
                variant="ghost"
                color="error"
                icon="i-lucide-trash-2"
                label="Descartar"
                :disabled="Boolean(aplicandoId)"
                @click="pedirDescarte(accion)"
              />
            </div>
          </div>
        </li>
      </ul>
    </UCard>

    <div v-if="revisadas.length" class="mt-4">
      <UButton
        variant="ghost"
        color="neutral"
        size="sm"
        :icon="mostrarArchivadas ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
        :label="mostrarArchivadas ? 'Ocultar revisadas' : `Ver revisadas (${acciones.revisadas.value.length})`"
        @click="mostrarArchivadas = !mostrarArchivadas"
      />

      <UCard v-if="mostrarArchivadas" class="mt-2">
        <ul class="divide-y divide-default">
          <li
            v-for="accion in revisadas"
            :key="accion.id"
            class="py-2 flex items-start justify-between gap-3"
          >
            <div class="min-w-0">
              <p class="text-sm truncate">
                {{ nombreProducto(accion) }} · {{ Number(accion.cantidad) }} ×
                {{ fmtPrecio(accion.precioUnitario) }}
              </p>
              <p class="text-xs text-muted">
                {{ fechaCompleta(accion.dictadoEn) }} · por {{ accion.usuarioNombre || 'el jefe' }}
              </p>
            </div>
            <UBadge
              variant="soft"
              size="sm"
              :color="accion.estado === 'aplicada' ? 'success' : 'neutral'"
              :label="motivoRevision(accion)"
            />
          </li>
        </ul>
      </UCard>
    </div>

    <InventarioDialogoVenta
      v-model="dialogoEditar"
      :producto="productoEdicion"
      :ubicacion="editando?.ubicacion ?? 'quiosco'"
      :modo="MODOS[editando?.tipoVenta] ?? 'venta'"
      :prefill="prefillEdicion"
      :fecha="editando?.dictadoEn ?? null"
      @guardado="onGuardadoEdicion"
    />

    <BaseDialog
      v-model="dialogoDescartar"
      title="Descartar acción"
      :description="`No se registrará ${nombreProducto(descartando)}`"
      confirm-text="Descartar"
      confirm-color="error"
      :loading="descartandoEnCurso"
      @confirm="confirmarDescarte"
      @cancel="dialogoDescartar = false"
    >
      <p class="text-sm text-muted">
        El dictado se conserva para auditar, pero no descuenta inventario ni
        suma ingresos. Si fue una venta real, regístrala desde Quiosco o Almacén.
      </p>
    </BaseDialog>

    <!-- El dictado no se pierde porque el STT no entendiera el nombre: se
         elige el producto del catálogo y queda listo para registrar. -->
    <BaseDialog
      v-model="dialogoAsignar"
      title="Asignar producto"
      description="Elige qué se vendió. La cantidad y el precio dictados se conservan."
      confirm-text="Asignar"
      :loading="asignandoEnCurso"
      :disabled-guardar="!productoAsignado"
      @confirm="confirmarAsignar"
      @cancel="dialogoAsignar = false"
    >
      <div class="space-y-3">
        <p v-if="asignando?.texto" class="text-xs text-muted italic">
          “{{ asignando.texto }}”
        </p>
        <UFormField label="Producto" required>
          <USelectMenu
            v-model="productoAsignado"
            :items="opcionesAsignar"
            value-key="id"
            label-key="label"
            :loading="cargandoCatalogo"
            placeholder="Buscar producto..."
            class="w-full"
          />
        </UFormField>
        <p v-if="asignando" class="text-sm">
          {{ Number(asignando.cantidad) }} ×
          {{ fmtPrecio(asignando.precioUnitario) }}
          = <span class="font-mono font-medium">{{ fmtPrecio(asignando.importe) }}</span>
        </p>
      </div>
    </BaseDialog>
  </BaseHeaderPage>
</template>
