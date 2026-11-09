<script setup>
import { Capacitor } from '@capacitor/core'
import { esAfirmacion, esNegacion } from '../utils/voice/confirmacion'
import { registrarProof } from '../utils/voice/proofs'

const auth = useAuth()
const perms = usePermisos()
const isCollapsed = ref(true)
const mobileOpen = ref(false)
const vozDialogRef = ref(null)
const zeroTouch = useVoiceZeroTouch()
const voiceRaw = useVoiceCommand()
const ttsRaw = useTts()
const ceroToquesActivo = computed(() => zeroTouch.activo.value)
const { hayRed, cargarEstado, faseSync, progresoSync } = useSync()
const conexion = useModoConexion()
const route = useRoute()
const esDev = import.meta.dev
const vozQuiosco = useVentaPorVoz('quiosco')
const vozAlmacen = useVentaPorVoz('almacen')
const dictadoModo = useDictadoModo()
// Dentro de inventario manda la ruta. Fuera de inventario el dock sigue
// disponible (venta global), pero usa la ubicación cuyo permiso de voz tenga
// el usuario, en vez de asumir quiosco siempre.
const ubicacionVozActual = computed(() => {
  const ruta = route.path || ''
  if (ruta.startsWith('/almacen') || ruta.startsWith('/inventario')) return 'almacen'
  if (ruta.startsWith('/quiosco')) return 'quiosco'
  if (perms.puedeAccion('quiosco', 'voz')) return 'quiosco'
  if (perms.puedeAccion('almacen', 'voz')) return 'almacen'
  return 'quiosco'
})
const vozActiva = computed(() =>
  ubicacionVozActual.value === 'almacen' ? vozAlmacen : vozQuiosco
)
const vozDialogAbierto = ref(false)
void zeroTouch.cargar()

/**
 * Espera una respuesta hablada ("sí"/"no") durante `timeoutMs`. Resuelve una
 * sola vez y limpia watcher y timer, para que un "sí" tardío no confirme dos
 * veces ni deje el micrófono colgado.
 */
function esperarRespuestaVoz(timeoutMs) {
  return new Promise((resolve) => {
    let resuelto = false
    let detener = null
    let timer = null
    const terminar = (valor) => {
      if (resuelto) return
      resuelto = true
      if (timer) clearTimeout(timer)
      try {
        detener?.()
      } catch {
        /* noop */
      }
      resolve(valor)
    }
    const revisar = () => {
      const texto = String(voiceRaw.transcript?.value || voiceRaw.transcriptParcial?.value || '')
      if (esNegacion(texto)) return terminar('negado')
      if (esAfirmacion(texto)) return terminar('afirmado')
      if (voiceRaw.estado.value === 'error') return terminar('error')
      // La escucha terminó sin una respuesta reconocible: no esperar de más.
      if (voiceRaw.estado.value === 'ready') return terminar('timeout')
    }
    detener = watch(
      [() => voiceRaw.transcript?.value, () => voiceRaw.transcriptParcial?.value, () => voiceRaw.estado.value],
      revisar
    )
    timer = setTimeout(() => terminar('timeout'), timeoutMs)
    revisar()
  })
}

watch(() => vozActiva.value.producto.value, async (fila) => {
  if (!fila) return
  // Default (no PRO): abre modal y espera un toque.
  if (!ceroToquesActivo.value || vozActiva.value.modo.value !== 'venta') {
    vozDialogAbierto.value = true
    return
  }
  // Modo PRO: abre modal para precargar form, avisa, escucha el "sí" y confirma.
  vozDialogAbierto.value = true
  await nextTick()
  // Esperar a la lectura del producto (read-back) para que la confirmación no
  // interrumpa el anuncio de lo que se va a vender.
  const rb = vozActiva.value.readBackPromise?.value
  if (rb && typeof rb.then === 'function') {
    await Promise.race([rb, new Promise(resolve => setTimeout(resolve, 3500))])
  }
  await new Promise(r => setTimeout(r, 200))
  const prefill = vozActiva.value.prefill.value
  let resultado = 'timeout'
  let confianza = 0
  try {
    if (voiceRaw.estado.value === 'listening') return
    try {
      await ttsRaw.speak('Diga sí para confirmar.')
    } catch {
      /* noop */
    }
    await new Promise(r => setTimeout(r, 200))
    // startListening resuelve al terminar la escucha; no se espera aquí.
    const escucha = voiceRaw.startListening().catch(() => {})
    resultado = await esperarRespuestaVoz(zeroTouch.timeoutMs.value)
    confianza = Number(voiceRaw.confidence?.value) || 0
    try {
      await voiceRaw.stopListening()
    } catch {
      /* noop */
    }
    await escucha
    voiceRaw.reset()
  } catch {
    /* degrade: queda el modal abierto para toque manual */
  }
  // Proof de audit (local, sin texto crudo).
  try {
    await registrarProof({
      comando: 'venta_directa',
      productoId: fila?.productoId ?? fila?.id ?? null,
      productoNombre: fila?.nombre ?? null,
      cantidad: prefill?.cantidad ?? null,
      ubicacion: prefill?.ubicacion ?? null,
      modo: prefill?.modo ?? null,
      confianza,
      outcome: resultado === 'afirmado'
        ? 'auto-confirmado'
        : (resultado === 'negado' ? 'cancelado' : 'abandonado')
    })
  } catch { /* noop */ }
  if (resultado === 'negado') {
    try {
      vozDialogAbierto.value = false
    } catch {
      /* noop */
    }
    try {
      await ttsRaw.speak('Cancelado.')
    } catch {
      /* noop */
    }
    vozActiva.value.limpiar()
  } else if (resultado === 'afirmado' && vozDialogRef.value?.confirmar) {
    vozDialogRef.value.confirmar()
  } else {
    try {
      await ttsRaw.speak('Sin respuesta, confirme manualmente.')
    } catch {
      /* noop */
    }
  }
})
watch(vozDialogAbierto, (abierto) => {
  if (!abierto) vozActiva.value.limpiar()
})
// Cambiar de quiosco a almacén no debe arrastrar el producto ni dejar el
// micrófono de la ubicación anterior abierto.
watch(ubicacionVozActual, () => {
  vozDialogAbierto.value = false
  void vozQuiosco.cancelar()
  void vozAlmacen.cancelar()
})

const config = useRuntimeConfig()
const etiquetaSync = computed(() => etiquetaFaseSync(faseSync.value, progresoSync.value))
const mostrarBannerSync = computed(() => conexion.transicionando.value || faseSync.value !== 'inactiva')
// Avance real de la fase en curso (subida por lotes, bajada o aplicación).
const porcentajeSync = computed(() => {
  const { actual, total } = progresoSync.value ?? {}
  if (!total) return 0
  return Math.min(100, Math.max(0, Math.round((actual / total) * 100)))
})

// El cambio Online/Local solo existe en Android nativo: en web el modo es
// forzosamente online y el sqlite es in-memory (se pierde al recargar).
const esNativo = computed(() => {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
})

const inactTimeout = Number(config.public.sessionInactivityTimeoutJefeSegundos) || 60
const ACTIVITY_THROTTLE_MS = Math.max(5000, (inactTimeout * 1000) / 2)
let ultimoRegistroActividad = 0
function onUserActivity() {
  const ahora = Date.now()
  if (ahora - ultimoRegistroActividad > ACTIVITY_THROTTLE_MS) {
    ultimoRegistroActividad = ahora
    auth.registrarActividad()
  }
}

onMounted(() => {
  perms.cargarDesdePreferencias().catch(() => {})
  cargarEstado()
  conexion.cargar().catch(() => {})
  document.addEventListener('click', onUserActivity)
  document.addEventListener('keydown', onUserActivity)
  document.addEventListener('touchstart', onUserActivity)
})

onUnmounted(() => {
  document.removeEventListener('click', onUserActivity)
  document.removeEventListener('keydown', onUserActivity)
  document.removeEventListener('touchstart', onUserActivity)
})

const colorMode = useColorMode()
const isDark = computed({
  get() {
    return colorMode.value === 'dark'
  },
  set(val) {
    colorMode.preference = val ? 'dark' : 'light'
  }
})

const links = computed(() => {
  const items = []

  if (auth.esJefe.value) {
    items.push(
      { label: 'Cuadre del día', icon: 'i-lucide-clipboard-check', to: '/cuadre', vista: 'cuadre' },
      { label: 'Historial de cuadres', icon: 'i-lucide-clock', to: '/cuadres', vista: 'cuadres' },
      { label: 'Historial del quiosco', icon: 'i-lucide-store', to: '/historial-quiosco', vista: 'historial-quiosco' },
      { label: 'Deudas', icon: 'i-lucide-hand-coins', to: '/deudas', vista: 'deudas' },
      { label: 'Venta directa', icon: 'i-lucide-receipt', to: '/venta-directa', vista: 'salidas' },
      { label: 'Productos', icon: 'i-lucide-package', to: '/productos', vista: 'productos' },
      ...(MOSTRAR_PROVEEDOR
        ? [{ label: 'Proveedores', icon: 'i-lucide-truck', to: '/proveedores', vista: 'proveedores' }]
        : []),
      { label: 'Quiosco', icon: 'i-lucide-store', to: '/quiosco', vista: 'quiosco' },
      { label: 'Almacén', icon: 'i-lucide-warehouse', to: '/almacen', vista: 'almacen' },
      { label: 'Usuarios', icon: 'i-lucide-user-cog', to: '/usuarios', vista: 'usuarios' },
      { label: 'Clientes', icon: 'i-lucide-users', to: '/clientes', vista: 'clientes' },
      { label: 'Ficha cliente', icon: 'i-lucide-user-search', to: '/ficha-cliente', vista: 'ficha-cliente' },
      { label: 'Gráficas', icon: 'i-lucide-bar-chart-2', to: '/graficas', vista: 'graficas' },
      { label: 'Recargas', icon: 'i-lucide-smartphone-charging', to: '/recargas', vista: 'recargas' },
      { label: 'Por confirmar', icon: 'i-lucide-message-square-text', to: '/recargas/sms', vista: 'recargas-sms' }
    )
  } else if (auth.esTrabajador.value) {
    items.push(
      {
        label: 'Cuadre del día',
        icon: 'i-lucide-clipboard-check',
        to: '/cuadre'
      }
    )
  }
  return items.filter(link => !link.vista || perms.puedeVista(link.vista))
})

const userMenuItems = computed(() => {
  const items = [
    [
      {
        label: auth.usuarioActual.value?.nombre || 'Usuario',
        slot: 'profile',
        disabled: true
      }
    ]
  ]

  if (auth.esJefe.value && esNativo.value) {
    const enTransicion = conexion.transicionando.value
    const modoItems = [
      {
        label: enTransicion && etiquetaSync.value
          ? etiquetaSync.value
          : (conexion.modo.value === 'online' ? 'Modo: Online' : 'Modo: Local'),
        icon: enTransicion ? 'i-lucide-loader-circle' : (conexion.modo.value === 'online' ? 'i-lucide-globe' : 'i-lucide-database'),
        onSelect: () => { if (!enTransicion) conexion.toggle() },
        disabled: enTransicion
      }
    ]
    if (enTransicion) {
      modoItems.push({
        label: 'Cancelar sincronización',
        icon: 'i-lucide-x',
        onSelect: () => { cancelarSincronizacion() }
      })
    }
    items.push(modoItems)
  }

  items.push(
    [
      {
        label: isDark.value ? 'Tema Claro' : 'Tema Oscuro',
        icon: isDark.value ? 'i-lucide-sun' : 'i-lucide-moon',
        onSelect: () => { isDark.value = !isDark.value }
      }
    ],
    [
      {
        label: 'Configuración',
        icon: 'i-lucide-settings',
        to: '/settings'
      }
    ],
    [
      {
        label: 'Cerrar sesión',
        icon: 'i-lucide-log-out',
        onSelect: () => { auth.logout() }
      }
    ]
  )

  return items
})
</script>

<template>
  <UDashboardGroup unit="rem" class="w-full min-h-screen flex">
    <UDashboardSidebar
      id="default"
      v-model:open="mobileOpen"
      v-model:collapsed="isCollapsed"
      collapsible
      class="bg-elevated/25 border-r border-gray-200 dark:border-gray-800"
    >
      <template #header="{ collapsed }">
        <div class="flex items-center gap-2 px-2 py-1 select-none cursor-pointer" @click="isCollapsed = !isCollapsed">
          <UIcon name="i-lucide-store" class="size-6 text-primary shrink-0" />
          <span v-if="!collapsed" class="font-semibold truncate">MiQuiosco</span>
        </div>
      </template>

      <template #default="{ collapsed }">
        <UNavigationMenu
          :collapsed="collapsed"
          :items="links"
          orientation="vertical"
          tooltip
        />
      </template>

      <template #footer="{ collapsed }">
        <div class="border-t border-gray-200 dark:border-gray-800 w-full">
          <UDropdownMenu v-if="auth.usuarioActual.value" :items="userMenuItems" :popper="{ placement: collapsed ? 'right-start' : 'top' }">
            <UButton
              color="neutral"
              variant="ghost"
              class="w-full flex items-center gap-2 px-2 py-1.5"
              :class="{ 'justify-center': collapsed }"
            >
              <div class="relative shrink-0">
                <UAvatar
                  :alt="auth.usuarioActual.value?.nombre"
                  size="sm"
                />
                <span
                  v-if="auth.esJefe.value"
                  class="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-background"
                  :class="hayRed ? 'bg-green-500' : 'bg-red-500'"
                />
              </div>
              <div v-if="!collapsed" class="text-left min-w-0 flex-1">
                <p class="text-sm font-medium truncate">
                  {{ auth.usuarioActual.value?.nombre }}
                </p>
                <p class="text-xs text-muted truncate">
                  {{ auth.rol.value }}
                </p>
              </div>
            </UButton>

            <template #profile="{ item }">
              <div class="text-left px-2 py-1.5">
                <p class="text-xs text-muted">
                  Sesión activa como
                </p>
                <p class="text-sm font-semibold text-gray-900 dark:text-white truncate">
                  {{ item.label }}
                </p>
              </div>
            </template>
          </UDropdownMenu>
        </div>
      </template>
    </UDashboardSidebar>

    <VoiceListeningBar
      :visible="vozActiva.micVisible.value && (vozActiva.ocupado.value || vozActiva.estado.value === 'error')"
      :ocupado="vozActiva.ocupado.value"
      :estado="vozActiva.estado.value"
      :error="vozActiva.ultimoError.value || ''"
      :transcript="vozActiva.transcriptParcial.value"
      @reintentar="vozActiva.reintentar()"
    />

    <div class="flex-1 min-w-0 w-full p-6 overflow-y-auto">
      <VoiceDock
        v-if="vozActiva.micVisible.value"
        :visible="vozActiva.micVisible.value"
        :disponible="vozActiva.disponible.value"
        :ocupado="vozActiva.ocupado.value"
        :estado="vozActiva.estado.value"
        :motivo="vozActiva.motivoNoDisponible.value"
        :push-to-talk="dictadoModo.pushToTalk.value"
        :error="vozActiva.ultimoError.value"
        @activar="vozActiva.venderPorVoz()"
        @detener="vozActiva.detenerEscucha()"
        @cancelar="vozActiva.cancelarEscucha()"
      />
      <!-- Simulador de voz solo en desarrollo: ejecuta el pipeline sin micrófono. -->
      <SimuladorVoz
        v-if="esDev"
        class="fixed bottom-4 left-4 z-50"
        @simular="vozActiva.simular($event)"
      />

      <BaseDialog
        v-model="vozActiva.showCandidatos.value"
        :title="vozActiva.tituloCandidatos.value || 'Elegir producto'"
        description="El reconocimiento no fue suficientemente claro. Confirma cual corresponde."
        hide-confirm
        @cancel="vozActiva.cancelar()"
      >
        <div class="space-y-2">
          <UButton
            v-for="candidate in vozActiva.candidatos.value"
            :key="candidate.product.id"
            block
            variant="ghost"
            color="neutral"
            class="justify-start"
            @click="vozActiva.seleccionarCandidato(candidate)"
          >
            <span class="flex flex-col items-start">
              <span>{{ candidate.row?.nombre ?? candidate.product.name }}</span>
              <span v-if="candidate.row?.descripcion" class="text-xs text-muted">{{ candidate.row.descripcion }}</span>
            </span>
            <span class="ml-auto text-xs text-muted">{{ Math.round(((candidate.scoreEfectivo ?? candidate.score) * 100)) }}%</span>
          </UButton>
        </div>
      </BaseDialog>

      <InventarioDialogoVenta
        ref="vozDialogRef"
        v-model="vozDialogAbierto"
        :producto="vozActiva.producto.value"
        :ubicacion="vozActiva.prefill.value?.ubicacion ?? ubicacionVozActual"
        :modo="vozActiva.modo.value"
        :prefill="vozActiva.prefill.value"
        @guardado="void (vozActiva.limpiar(), vozActiva.invalidarCatalogoVoz())"
      />

      <UButton
        v-if="isCollapsed"
        icon="i-lucide-menu"
        variant="ghost"
        size="sm"
        class="lg:hidden mb-4"
        @click="mobileOpen = true"
      />
      <slot />
    </div>

    <!-- Progreso visible del cambio Local/Online: el toggle cierra el menú al
         tocarlo, así que el estado vive aquí para que se vea sin reabrir nada.
         Ancho completo en móvil (el texto no cabe en una píldora) y compacto
         en pantallas grandes. -->
    <div
      v-if="mostrarBannerSync"
      class="fixed bottom-4 inset-x-4 z-50 mx-auto max-w-xl rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-gray-900/95 px-4 py-2.5 shadow-lg"
    >
      <div class="flex items-center gap-3">
        <UIcon name="i-lucide-loader-circle" class="size-4 shrink-0 animate-spin text-primary" />
        <span class="min-w-0 flex-1 text-sm font-medium break-words">{{ etiquetaSync || 'Sincronizando…' }}</span>
        <UButton
          size="xs"
          variant="ghost"
          color="neutral"
          icon="i-lucide-x"
          aria-label="Cancelar sincronización"
          @click="cancelarSincronizacion()"
        />
      </div>
      <div
        v-if="porcentajeSync > 0"
        class="mt-2 h-1 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
      >
        <div
          class="h-full rounded-full bg-primary transition-all duration-300"
          :style="{ width: porcentajeSync + '%' }"
        />
      </div>
    </div>
  </UDashboardGroup>
</template>
